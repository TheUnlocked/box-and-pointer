/// <reference path="../references/jsplumb.d.ts" />
import { parse as sParse } from "./sparse/parser.js";
import SExpression from "./sparse/sexpr.js";
import HTMLParsedElement from "./html-parsed-element/index.js";

class PairObject {
    public head: Pair | string | null;
    public tail: Pair | string | null;

    constructor(head: string | Pair | null, tail: string | Pair | null) {
        this.head = head;
        this.tail = tail;
    }
}

type Pair = PairObject | SExpression;
const isPair = (object: any): object is Pair => {
    return object instanceof PairObject || object instanceof SExpression;
}

class BoxAndPointerElement extends HTMLParsedElement {
    private visited: Pair[] = [];
    private _visitedElements: HTMLDivElement[] = [];
    private arrowBindings: [HTMLDivElement, HTMLDivElement, "Top" | "Left" | "unknown"][] = [];
    private slashes: HTMLDivElement[] = [];
    private shadow: ShadowRoot;

    constructor(){
        super();
        this.shadow = this.attachShadow({mode: "open"});
        this.shadow.innerHTML = "";
    }

    async parsedCallback() {
        const root = this.generatePairsFromDOM();
        
        const rows = [document.createElement('div')];
        rows[0].classList.add('bp--row');

        this.renderDiagram(null, rows, 0, root, []);
        for (let row of rows){
            this.shadow.appendChild(row);
        }
        
        const plumb = jsPlumb.getInstance({
            Container: this.shadow,
            PaintStyle: {stroke: "black", strokeWidth: 1.5, fill: "none"}
        });

        // Make sure stylesheets are loaded. This ensures cross-browser compatibility.
        const stylesheets = [document.getElementById('box-and-pointer-style')!.cloneNode()];
        if (this.hasAttribute('stylesheet')){
            const stylesheet = document.createElement('link');
            stylesheet.rel = 'stylesheet';
            stylesheet.href = this.getAttribute('stylesheet')!;
            stylesheets.push(stylesheet);
        }
        let toLoad = stylesheets.length;
        for (let ss of stylesheets){
            ss.addEventListener('load', () => --toLoad === 0 && plumb.ready(loadArrows));
        }
        this.shadow.prepend(...stylesheets);

        const loadArrows = () => {
            const overlays: OverlaySpec[] = [["Arrow", { location: 1, width: 8, length: 12, }], ["Label", {location: 0, cssClass: "bp--pointer-source"}]];
            for (let binding of this.arrowBindings){
                if (binding[2] !== "unknown"){
                    plumb.connect({
                        source: binding[0],
                        target: binding[1],
                        anchors: ["Center", binding[2]],
                        overlays: overlays,
                        connector: "Straight",
                        endpoint: "Blank"
                    });
                }
                else{
                    plumb.connect({
                        source: binding[0],
                        target: binding[1],
                        anchors: ["Center", ["Continuous", {faces: ['top', 'left', 'bottom']}]],
                        overlays: overlays,
                        connector: [binding[0].parentElement!.parentElement === binding[1].parentElement!.parentElement ? "StateMachine" : "Bezier", {curviness: 40, proximityLimit:0 , margin: 0.01}],
                        endpoint: "Blank"
                    });
                }
            }
            for (let slashTarget of this.slashes){
                plumb.connect({
                    source: slashTarget,
                    target: slashTarget,
                    anchors: ["TopRight", "BottomLeft"],
                    connector: "Straight",
                    endpoint: "Blank"
                });
            }

            // fix pointer positions
            const rect = this.getBoundingClientRect();
            for (const arrow of <NodeListOf<HTMLDivElement | SVGElement>>this.shadow.querySelectorAll('.jtk-overlay, .jtk-endpoint, .jtk-connector')){
                
                arrow.style.top = `${+arrow.style.top!.slice(0, arrow.style.top!.length-2) - rect.top - window.scrollY}px`;
                arrow.style.left = `${+arrow.style.left!.slice(0, arrow.style.left!.length-2) - rect.left - window.scrollX}px`;
            }

            this.classList.add('bp--loaded');
            // window.addEventListener('resize', e => plumb.repaintEverything(true));
        };
    }

    private generatePairsFromDOM(): Pair{
        const namedPairs: {[name: string]: Pair} = {};
        const refsToResolve: [Pair, 'head' | 'tail'][] = [];
        let rootPair: Pair | undefined;
        const originPairExists = [...this.children].find(x => x.hasAttribute('origin'));

        const getRealChildren = (nodes: Node[]): (Pair | string | HTMLElement)[] => {
            const filteredChildren: (Text | HTMLElement)[] =
                <(Text | HTMLElement)[]>nodes.filter(x => (x instanceof Text && x.data.trim() !== "") || x instanceof HTMLElement);
            return filteredChildren.reduce((result: (Pair | string | HTMLElement)[], current: Text | HTMLElement): (Pair | string | HTMLElement)[] => {
                if (current instanceof Text){
                    let sexpr: Pair | null = sParse(current.data);
                    const ins: (string | Pair)[] = [];
                    while (isPair(sexpr)){
                        ins.push(sexpr.head);
                        sexpr = sexpr.tail;
                    }
                    return result.concat(ins);
                }
                else{
                    result.push(current);
                    return result;
                }
            }, []);
        };

        const generateValueFromBox = (currentPair: Pair, position: 'head' | 'tail', element: Element): Pair | string | null => {
            if (element.hasAttribute('ref') && element.getAttribute('ref') !== ""){
                refsToResolve.push([currentPair, position]);
                return element.getAttribute('ref');
            }
            else if (element.hasAttribute('value') && element.getAttribute('value') !== "") {
                return element.getAttribute('value');
            }
            else {
                const realChildNodes: (Pair | string | HTMLElement)[] = getRealChildren([...element.childNodes]);
                if (realChildNodes.length > 0){
                    let node = realChildNodes[0];
                    if (typeof node === "string" || isPair(node)){
                        return node;
                    }
                    else if(node.tagName === "EMPTY"){
                        return null;
                    }
                    else if (node.tagName === "PAIR"){
                        return generatePairFromElement(node);
                    }
                    else if (node.tagName === "LIST"){
                        return generatePairFromListElement(node);
                    }
                    else{
                        return null;
                    }
                }
                else{
                    return null;
                }
            }
        }

        const generatePairFromElement = (element: Element): Pair => {
            let pair: Pair = new PairObject(null, null);

            if (element.hasAttribute('name') && element.getAttribute('name') !== ""){
                namedPairs[element.getAttribute('name')!] = pair;
            }

            const realChildNodes = getRealChildren([...element.childNodes]);

            if (realChildNodes.length > 0){
                let node = realChildNodes[0];
                if (typeof node === "string" || isPair(node)){
                    pair.head = node;
                }
                else if (node.tagName === "BOX"){
                    pair.head = generateValueFromBox(pair, 'head', node);
                }
                else if (node.tagName === "EMPTY"){
                    pair.head = null;
                }
                else if (node.tagName === "PAIR"){
                    pair.head = generatePairFromElement(node);
                }
                else if (node.tagName === "LIST"){
                    pair.head = generatePairFromListElement(node);
                }
                else{
                    console.error(`Expected text, box, pair, list, or empty, intead got ${node.tagName.toLowerCase()}`);
                }
            }
            if (realChildNodes.length > 1){
                let node = realChildNodes[1];
                if (typeof node === "string" || isPair(node)){
                    pair.tail = node;
                }
                else if (node.tagName === "BOX"){
                    pair.tail = generateValueFromBox(pair, 'tail', node);
                }
                else if (node.tagName === "EMPTY"){
                    pair.tail = null;
                }
                else if (node.tagName === "PAIR"){
                    pair.tail = generatePairFromElement(node);
                }
                else if (node.tagName === "LIST"){
                    pair.tail = generatePairFromListElement(node);
                }
                else{
                    console.error(`Expected text, box, pair, list, or empty, intead got ${node.tagName.toLowerCase()}`);
                }
                for (let node of realChildNodes.slice(2)){
                    if (node instanceof HTMLElement && (node.tagName === "PAIR" || node.tagName === "LIST")){
                        generatePairFromElement(node);
                    }
                }
            }

            return pair;
        };

        const generatePairFromListElement = (element: Element): Pair => {
            const rootPair = new PairObject(null, null)
            let pair: Pair = rootPair;

            if (element.hasAttribute('name') && element.getAttribute('name') !== ""){
                namedPairs[element.getAttribute('name')!] = pair;
            }
            const explicitTail = element.hasAttribute('explicit-tail');

            const realChildNodes = getRealChildren([...element.childNodes]);
            
            const lastElementIndex = realChildNodes.length - (explicitTail ? 2 : 1);
            for (const node of realChildNodes.slice(0, lastElementIndex + 1)){
                if (typeof node === "string" || isPair(node)){
                    pair.head = node;
                }
                else if (node.tagName === "BOX"){
                    pair.head = generateValueFromBox(pair, 'head', node);
                }
                else if (node.tagName === "EMPTY"){
                    pair.head = null;
                }
                else if (node.tagName === "PAIR"){
                    pair.head = generatePairFromElement(node);
                }
                else if (node.tagName === "LIST"){
                    pair.head = generatePairFromListElement(node);
                }
                else{
                    console.error(`Expected text, box, pair, list, or empty, intead got ${node.tagName.toLowerCase()}`);
                }
                if (node !== realChildNodes[lastElementIndex]){
                    pair.tail = new PairObject(null, null);
                    pair = pair.tail;
                }
            }
            if (explicitTail){
                const node = realChildNodes[realChildNodes.length-1];
                if (node instanceof Text){
                    pair.tail = node.data.trim();
                }
                else if (typeof node === "string" || isPair(node)){
                    pair.tail = node;
                }
                else if (node.tagName === "BOX"){
                    pair.tail = generateValueFromBox(pair, 'tail', node);
                }
                else if (node.tagName === "EMPTY"){
                    pair.tail = null;
                }
                else if (node.tagName === "PAIR"){
                    pair.tail = generatePairFromElement(node);
                }
                else if (node.tagName === "LIST"){
                    pair.tail = generatePairFromListElement(node);
                }
                else{
                    console.error(`Expected text, box, pair, list, or empty, intead got ${node.tagName.toLowerCase()}`);
                }
            }
            return rootPair;
        };

        for (const element of getRealChildren([...this.childNodes])){
            if (typeof element === 'string'){
                console.error(`Expected pair or list, intead got ${element}`);
            }
            else if (isPair(element)){
                if (!rootPair && !originPairExists){
                    rootPair = element;
                }
            }
            else if (element.tagName === "PAIR" || element.tagName === "LIST"){
                let currentPair;
                if (element.tagName === "PAIR"){
                    currentPair = generatePairFromElement(element);
                }
                else{
                    currentPair = generatePairFromListElement(element);
                }
                if (!rootPair && (!originPairExists || element.hasAttribute('origin'))){
                    rootPair = currentPair;
                }
            }
            else{
                console.error(`Expected pair or list, intead got ${element.tagName.toLowerCase()}`);
            }
        }
        for (let binding of refsToResolve){
            binding[0][binding[1]] = namedPairs[binding[0][binding[1]] as string] || null;
        }

        if (rootPair === undefined){
            rootPair = new PairObject(null, null);
        }
        return rootPair
    }

    private renderDiagram(senderBox: HTMLDivElement | null, rows: HTMLDivElement[], rowIndex: number, pair: Pair, paddingBoxes: HTMLDivElement[]) {
        if (senderBox && this.visited.includes(pair)){
            this.arrowBindings.push([senderBox, this._visitedElements[this.visited.indexOf(pair)], "unknown"]);
            return;
        }
        this.visited.push(pair);

        const row = rows[rowIndex];

        for (let div of paddingBoxes){
            let clone: HTMLDivElement = <HTMLDivElement>div.cloneNode(true);
            clone.style.visibility = "hidden";
            row.appendChild(clone);
        }

        const myIndex = row.children.length;

        const pairBox = document.createElement('div');
        const headBox = document.createElement('div');
        this._visitedElements.push(headBox);
        senderBox ? this.arrowBindings.push([senderBox, headBox, row === senderBox.parentElement!.parentElement ? "Left" : "Top"]) : null;
        const tailBox = document.createElement('div');
        pairBox.classList.add('bp--pair');
        headBox.classList.add('bp--box');
        tailBox.classList.add('bp--box');

        pairBox.appendChild(headBox);
        pairBox.appendChild(tailBox);
        row.appendChild(pairBox);

        if (isPair(pair.tail)){
            // handle this later
        }
        else if (pair.tail == null){
            this.slashes.push(tailBox);
        }
        else{
            const body = document.createElement('span');
            body.innerText = pair.tail;
            tailBox.appendChild(body);
        }

        if (isPair(pair.head)){
            // handle this later
        }
        else if (pair.head == null){
            this.slashes.push(headBox);
        }
        else{
            const body = document.createElement('span');
            body.innerText = pair.head;
            headBox.appendChild(body);
        }

        if (isPair(pair.tail)){
            this.renderDiagram(tailBox, rows, rowIndex, pair.tail, []);
        }
        if (isPair(pair.head)){
            const newIndex = rows.push(document.createElement('div')) - 1;
            rows[newIndex].classList.add('bp--row');
            this.renderDiagram(headBox, rows, newIndex, pair.head, (<HTMLDivElement[]>[...row.children]).slice(0, myIndex));
        }
    }
}

customElements.define('box-and-pointer', BoxAndPointerElement);