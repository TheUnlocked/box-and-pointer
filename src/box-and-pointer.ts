/// <reference path="../references/html-parsed-element.d.ts" />
/// <reference path="../references/jsplumb.d.ts" />
import HTMLParsedElement from 'https://unpkg.com/html-parsed-element/esm/index.js';

const bpss = document.getElementById('boxpointerss')!;

class Pair {
    public head: Pair | string | null;
    public tail: Pair | string | null;

    constructor(head: string | Pair | null, tail: string | Pair | null) {
        this.head = head;
        this.tail = tail;
    }
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
    }

    parsedCallback() {
        const root = this.generatePairsFromDOM();
        this.shadow.innerHTML = "";

        this.shadow.appendChild(bpss.cloneNode());
        
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
        
        plumb.ready(() => {
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
                        connector: ["Bezier", {curviness: 40, margin: 0.01}],
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
        });

        this.classList.add('bp--loaded');
    }

    private generatePairsFromDOM(): Pair{
        const namedPairs: {[name: string]: Pair} = {};
        const refsToResolve: [Pair, 'head' | 'tail'][] = [];
        let rootPair: Pair | undefined;
        const originPairExists = [...this.children].find(x => x.hasAttribute('origin'));

        const generateValueFromBox = (currentPair: Pair, position: 'head' | 'tail', element: Element): Pair | string | null => {
            if (element.hasAttribute('ref') && element.getAttribute('ref') !== ""){
                refsToResolve.push([currentPair, position]);
                return element.getAttribute('ref');
            }
            else if (element.hasAttribute('value') && element.getAttribute('value') !== "") {
                return element.getAttribute('value');
            }
            else {
                const realChildNodes: (Text | HTMLElement)[] = <(Text | HTMLElement)[]>[...element.childNodes]
                    .filter(x => (x instanceof Text && x.data.trim() !== "") || x instanceof HTMLElement);
                if (realChildNodes.length > 0){
                    let node = realChildNodes[0];
                    if (node instanceof Text){
                        return node.data.trim();
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
            let pair: Pair = new Pair(null, null);

            if (element.hasAttribute('name') && element.getAttribute('name') !== ""){
                namedPairs[element.getAttribute('name')!] = pair;
            }

            const realChildNodes: (Text | HTMLElement)[] = <(Text | HTMLElement)[]>[...element.childNodes]
                .filter(x => (x instanceof Text && x.data.trim() !== "") || x instanceof HTMLElement);

            if (realChildNodes.length > 0){
                let node = realChildNodes[0];
                if (node instanceof Text){
                    pair.head = node.data.trim();
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
                if (node instanceof Text){
                    pair.tail = node.data.trim();
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
            const rootPair = new Pair(null, null)
            let pair: Pair = rootPair;

            if (element.hasAttribute('name') && element.getAttribute('name') !== ""){
                namedPairs[element.getAttribute('name')!] = pair;
            }
            const explicitTail = element.hasAttribute('explicit-tail');

            const realChildNodes: (Text | HTMLElement)[] = <(Text | HTMLElement)[]>[...element.childNodes]
                .filter(x => (x instanceof Text && x.data.trim() !== "") || x instanceof HTMLElement);
            
            const lastElementIndex = realChildNodes.length - (explicitTail ? 2 : 1);
            for (const node of realChildNodes.slice(0, lastElementIndex + 1)){
                if (node instanceof Text){
                    pair.head = node.data.trim();
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
                    pair.tail = new Pair(null, null);
                    pair = pair.tail;
                }
            }
            if (explicitTail){
                const node = realChildNodes[realChildNodes.length-1];
                if (node instanceof Text){
                    pair.tail = node.data.trim();
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

        for (const element of this.children){
            if (element.tagName === "PAIR" || element.tagName === "LIST"){
                let currentPair
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
            rootPair = new Pair(null, null);
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
        senderBox ? this.arrowBindings.push([senderBox, headBox, paddingBoxes.length === 0 ? "Left" : "Top"]) : null;
        const tailBox = document.createElement('div');
        pairBox.classList.add('bp--pair');
        headBox.classList.add('bp--box');
        tailBox.classList.add('bp--box');

        pairBox.appendChild(headBox);
        pairBox.appendChild(tailBox);
        row.appendChild(pairBox);

        if (pair.tail instanceof Pair){
            // handle this later
        }
        else if (pair.tail == null){
            this.slashes.push(tailBox);
        }
        else{
            const body = document.createElement('span');
            body.innerText = pair.tail;
            const spacer: HTMLSpanElement = <HTMLSpanElement>body.cloneNode(true);
            spacer.classList.add('bp--spacer');
            tailBox.appendChild(body);
            tailBox.appendChild(spacer);
        }

        if (pair.head instanceof Pair){
            // handle this later
        }
        else if (pair.head == null){
            this.slashes.push(headBox);
        }
        else{
            const body = document.createElement('span');
            body.innerText = pair.head;
            const spacer: HTMLSpanElement = <HTMLSpanElement>body.cloneNode(true);
            spacer.classList.add('bp--spacer');
            headBox.appendChild(body);
            headBox.appendChild(spacer);
        }

        if (pair.tail instanceof Pair){
            this.renderDiagram(tailBox, rows, rowIndex, pair.tail, []);
        }
        if (pair.head instanceof Pair){
            const newIndex = rows.push(document.createElement('div')) - 1;
            rows[newIndex].classList.add('bp--row');
            this.renderDiagram(headBox, rows, newIndex, pair.head, (<HTMLDivElement[]>[...row.children]).slice(0, myIndex));
        }
    }
}

customElements.define('box-and-pointer', BoxAndPointerElement);