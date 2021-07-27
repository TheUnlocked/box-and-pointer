import { BoxObject, makePair, makeSingle, UIObjectType } from "./types/BoxObject";
import HTMLParsedElement from "html-parsed-element";
import { Attributes, InternalElement, internalElementTagNames, Tags } from "./types/ElementInfo";
import { ContentObject, ContentObjectType, emptySingleton, makeNullPointer, makePointer, makeRich, makeString, PointerObject, transformContentObject } from "./types/ContentObject";
import { parse as sParse, SExpression } from "sparse";

interface ArrowBinding {
    from: HTMLDivElement;
    to: HTMLDivElement;
    side: "Top" | "Left" | "unknown";
}

class BoxAndPointerElement extends HTMLParsedElement {
    private arrowBindings = [] as ArrowBinding[];
    private slashes = [] as HTMLDivElement[];
    private shadow: ShadowRoot;

    constructor(){
        super();
        this.shadow = this.attachShadow({mode: "open"});
        this.shadow.innerHTML = "";
    }

    override async parsedCallback() {
        const graph = this.calculateGraphFromDOM();

        for (const object of graph) {
            this.prepareRenderRoot(object);
        }

        for (const object of graph) {
            this.renderFromBoxObject(object, this.pushRow([]), true);
        }

        for (let row of this.rows){
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
            for (const binding of this.arrowBindings){
                if (binding.side !== "unknown"){
                    if (binding.side === "Top"){
                        binding.to.style.width = "2em";
                    }
                    plumb.connect({
                        source: binding.from,
                        target: binding.to,
                        anchors: ["Center", binding.side],
                        overlays: overlays,
                        connector: "Straight",
                        endpoint: "Blank"
                    });
                    if (binding.side === "Top"){
                        binding.to.style.width = "";
                    }
                }
                else{
                    plumb.connect({
                        source: binding.from,
                        target: binding.to,
                        anchors: ["Center", ["Continuous", {faces: ['top', 'left', 'bottom']}]],
                        overlays: overlays,
                        connector: [binding.from.parentElement!.parentElement === binding.to.parentElement!.parentElement ? "StateMachine" : "Bezier", { curviness: 40, proximityLimit:0, margin: 0.01 }],
                        endpoint: "Blank"
                    });
                }
            }
            for (const slashTarget of this.slashes){
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
                
                arrow.style.top = `${+arrow.style.top!.slice(0, -2) - rect.top - window.scrollY}px`;
                arrow.style.left = `${+arrow.style.left!.slice(0, -2) - rect.left - window.scrollX}px`;
            }

            this.classList.add('bp--loaded');
            // window.addEventListener('resize', e => plumb.repaintEverything(true));
        };
    }

    private getChildren(elt: BoxAndPointerElement | InternalElement, allowText: true): (InternalElement | string)[];
    private getChildren(elt: BoxAndPointerElement | InternalElement, allowText?: false): InternalElement[];
    private getChildren(elt: BoxAndPointerElement | InternalElement, allowText = false): (InternalElement | string)[] {
        return [...elt.childNodes].flatMap((node): (InternalElement | string)[] => {
            if (node instanceof HTMLElement) {
                if (internalElementTagNames.has(node.tagName as any)) {
                    return [node as InternalElement];
                }
                else {
                    // Invalid element
                    console.error('Found unexpected element %o in %o. Did you misspell a tag name?', node, elt);
                    return [];
                }
            }
            else {
                // Invalid node
                switch (node.nodeType) {
                    case Node.TEXT_NODE:
                        const text = node.nodeValue?.trim();
                        if (text) {
                            if (allowText) {
                                return [...text.matchAll(/\S+/g)].map(x => x[0]);
                            }
                            console.error('Found text %o in %o. Did you mean to use <lisp></lisp>?', node, elt);
                        }
                        break;
                    case Node.COMMENT_NODE:
                        break;
                    default:
                        console.error('Found unexpected node %o in %o.', node, elt);
                        break;
                }
                return [];
            }
        })
    }

    private search(node: BoxObject, callback: (node: BoxObject) => void) {
        const visited = new Set<BoxObject>();
        const _search = (node: BoxObject) => {
            if (visited.has(node)) {
                return;
            }
            visited.add(node);
            callback(node);
            switch (node.kind) {
                case UIObjectType.Single:
                    if (node.contents.kind === ContentObjectType.Pointer) {
                        _search(node.contents.target);
                    }
                    break;
                case UIObjectType.Pair:
                    if (node.lhs.kind === ContentObjectType.Pointer) {
                        _search(node.lhs.target);
                    }
                    if (node.rhs.kind === ContentObjectType.Pointer) {
                        _search(node.rhs.target);
                    }
                    break;
            }
        };
        _search(node);
    }

    private calculateGraphFromDOM(): BoxObject[] {
        const namedObjects: { [name: string]: BoxObject } = {};
        const refResolutionCallbacks: (() => void)[] = [];
        const graphRoots = [] as BoxObject[];
        const graphRootNames = new Set<string>();
        const noRootSymbol = Symbol();
        /**
         * Map from a named element to the names of every root whose tree is pointing to it.
         * If a tree pointing to it has no name, it will use noRootSymbol instead.
         */
        const graphRootRefGraph: { [name: string]: Set<string | typeof noRootSymbol> } = {};
        const rootElements = this.getChildren(this);
        const forcedRoots = new Set<BoxObject>();

        let $name: string | typeof noRootSymbol = noRootSymbol;

        const generateBoxObject = (element: InternalElement): BoxObject => {
            let object: BoxObject;
            switch (element.tagName) {
                case Tags.Box:
                    let [elt, ...extraElts] = this.getChildren(element, true);
                    for (const extraElt of extraElts) {
                        if (typeof extraElt === 'string') {
                            console.error("Found extraneous text node %o in %o could be interpreted as a value.", extraElt, element);
                        }
                        else {
                            console.error("Found extraneous element %o in %o.", extraElt, element);
                        }
                    }
                    if (!elt) {
                        console.error("<box> element %o contains no values, expected one.", element);
                        object = makeSingle({ contents: emptySingleton });
                    }
                    else {
                        object = makeSingle({ contents: typeof elt === 'string' ? makeString({ value: elt }) : generateContentObject(elt) });
                    }
                    break;
                case Tags.Pair: {
                    const [lhsElt, rhsElt, ...extraElts] = this.getChildren(element, true);
                    for (const extraElt of extraElts) {
                        if (typeof extraElt === 'string') {
                            console.error("Found extraneous text node %o in %o could be interpreted as a value.", extraElt, element);
                        }
                        else {
                            console.error("Found extraneous element %o in %o.", extraElt, element);
                        }
                    }

                    if (!rhsElt) {
                        console.error("<pair> element %o only contains one value, expected two.", element);
                        object = makePair({
                            lhs: typeof lhsElt === 'string' ? makeString({ value: lhsElt }) : generateContentObject(lhsElt),
                            rhs: emptySingleton
                        });
                    }
                    else if (!lhsElt) {
                        console.error("<pair> element %o contains no values, expected two.", element);
                        object = makePair({
                            lhs: emptySingleton,
                            rhs: emptySingleton
                        });
                    }
                    else {
                        object = makePair({
                            lhs: typeof lhsElt === 'string' ? makeString({ value: lhsElt }) : generateContentObject(lhsElt),
                            rhs: typeof rhsElt === 'string' ? makeString({ value: rhsElt }) : generateContentObject(rhsElt)
                        });
                    }
                    break;
                }
                case Tags.List: {
                    const elts = this.getChildren(element, true);
                    if (elts.length === 0) {
                        object = makeSingle({ contents: emptySingleton });
                    }
                    else if (element.hasAttribute(Attributes.ExplicitTail)) {
                        const tailElt = elts[elts.length - 1];
                        const tail = typeof tailElt === 'string' ? makeString({ value: tailElt }) : generateContentObject(tailElt);

                        object = elts.slice(0, -1).reduceRight((prev, lhsElt) => makePair({
                            lhs: typeof lhsElt === 'string' ? makeString({ value: lhsElt }) : generateContentObject(lhsElt),
                            rhs: prev === null ? tail : makePointer({ target: prev })
                        }), null as BoxObject | null)!;
                    }
                    else {
                        object = elts.reduceRight((prev, lhsElt) => makePair({
                            lhs: typeof lhsElt === 'string' ? makeString({ value: lhsElt }) : generateContentObject(lhsElt),
                            rhs: prev === null ? emptySingleton : makePointer({ target: prev })
                        }), null as BoxObject | null)!;
                    }
                    break;
                }
                case Tags.Lisp: {
                    element.childNodes.forEach(node => {
                        if (![Node.TEXT_NODE, Node.COMMENT_NODE].includes(node.nodeType)) {
                            console.error("<lisp> elements can only contain text, but found %o in %o.", node, element);
                        }
                    });

                    const convertMaybeSExpressionToContentObject = (val: any): ContentObject => {
                        if (val instanceof SExpression) {
                            return makePointer({ target: convertSExpressionToBoxObject(val) });
                        }
                        if (val == null) {
                            return emptySingleton;
                        }
                        return makeString({ value: val });
                    };

                    const convertSExpressionToBoxObject = (expr: SExpression): BoxObject => {
                        return makePair({ lhs: convertMaybeSExpressionToContentObject(expr.head), rhs: convertMaybeSExpressionToContentObject(expr.tail) });
                    };

                    const parsed = sParse(element.innerText).head;
                    if (!(parsed instanceof SExpression)) {
                        console.error("%o is not valid content for a <lisp> element. Did you mean to surround it with parentheses?", element.innerText);
                        object = makeSingle({ contents: emptySingleton });
                    }
                    else {
                        object = convertSExpressionToBoxObject(parsed);
                    }
                    break;
                }
                default:
                    console.error("Found <%s> element, but only <box>, <pair>, <list>, and <lisp> elements are permitted here.", element.tagName.toLowerCase());
                    object = makeSingle({ contents: generateContentObject(element) });
                    break;
            }
            
            const name = element.getAttribute(Attributes.Name);
            if (name) {
                namedObjects[name] = object;
            }

            if (element.getAttribute(Attributes.ForceRoot) !== null) {
                forcedRoots.add(object);
            }

            return object;
        };

        const generateContentObject = (element: InternalElement): ContentObject => {
            switch (element.tagName) {
                case Tags.Pointer: {
                    if (element.childNodes.length > 0) {
                        console.error("<pointer> element %o cannot have any children.", element);
                    }
                    const ref = element.getAttribute(Attributes.Ref);
                    if (!ref) {
                        console.error("<pointer> element %o must have a ref attribute, but is missing one.", element);
                        return emptySingleton;
                    }
                    
                    (graphRootRefGraph[ref] ??= new Set()).add($name);

                    if (ref in namedObjects) {
                        return makePointer({ target: namedObjects[ref] });
                    }

                    // ref doesn't exist yet
                    const pointer = makeNullPointer();
                    refResolutionCallbacks.push(() => {
                        if (ref in namedObjects) {
                            transformContentObject(pointer, makePointer({ target: namedObjects[ref] }));
                        }
                        else {
                            console.error("<pointer> element %o has ref=%o, but no element with that name exists.", element, ref);
                            transformContentObject(pointer, emptySingleton);
                        }
                    });
                    return pointer;
                }
                case Tags.Value:
                    return makeRich({ children: element.childNodes });
                case Tags.Empty:
                    return emptySingleton;
            }
            return makePointer({ target: generateBoxObject(element) });
        };

        for (const element of rootElements){
            const name = element.getAttribute(Attributes.Name);
            $name = name ?? noRootSymbol;
            const object = generateBoxObject(element);
            if (!name || forcedRoots.has(object)) {
                // If it's unnamed then it can't be referenced so it must be a graph root.
                graphRoots.push(object);
            }
            else {
                graphRootNames.add(name); 
            }
        }

        for (const root of forcedRoots) {
            if (!graphRoots.includes(root)) {
                graphRoots.push(root);
            }
        }

        // Resolve previously missing bindings
        for (const callback of refResolutionCallbacks){
            callback();
        }

        while (true) {
            // Find which graph roots aren't covered by our existing vertex set
            const missing = new Set([...graphRootNames].map(x => namedObjects[x]));
            for (const root of graphRoots) {
                this.search(root, node => missing.delete(node));
            }

            if (missing.size === 0) {
                break;
            }

            const availableFrom = new Map<BoxObject, number>();
            for (const root of missing) {
                availableFrom.set(root, 0);
            }
            for (const root of missing) {
                this.search(root, node => {
                    if (availableFrom.has(node)) {
                        availableFrom.set(node, availableFrom.get(node)! + 1);
                    }
                });
            }
            
            const pathsToHistogram = [] as BoxObject[][];
            for (const [root, sources] of availableFrom.entries()) {
                (pathsToHistogram[sources] ??= []).push(root);
            }
            for (let i = 0; i < pathsToHistogram.length; i++) {
                const roots = pathsToHistogram[i];
                if (roots && roots.length > 0) {
                    if (i === 0) {
                        // All roots with 0 paths to them are true roots.
                        for (const root of roots) {
                            graphRoots.push(root);
                        }
                    }
                    else {
                        // We have a cycle, so just pick an arbitrary root to use.
                        graphRoots.push(roots[0]);
                    }
                    break;
                }
            };
        }

        return graphRoots;
    }

    private rows = [] as HTMLDivElement[];
    private objectToPreparedEltBindings = new Map<BoxObject, HTMLDivElement>();
    private objectToEltBindings = new Map<BoxObject, HTMLDivElement>();

    private pushRow(referencePadding: Element[]): HTMLDivElement {
        const rowElt = document.createElement('div');
        rowElt.classList.add("bp--row");
        for (const elt of referencePadding) {
            const clone = elt.cloneNode(true) as Element;
            clone.classList.add("bp--hidden");
            rowElt.appendChild(clone);
        }
        this.rows.push(rowElt);
        return rowElt;
    }

    private prepareRenderRoot(object: BoxObject) {
        this.objectToPreparedEltBindings.set(object, document.createElement('div'));
    }

    private renderFromBoxObject(object: BoxObject, row: HTMLDivElement, root = false): HTMLDivElement {
        let preparedElt = this.objectToPreparedEltBindings.get(object);
        if (!root && preparedElt) {
            return preparedElt;
        }

        const position = row.childElementCount;

        const container = document.createElement('div');
        container.classList.add('bp--box-container');
        row.appendChild(container);

        this.objectToEltBindings.set(object, container);

        let headBox: ContentObject | undefined;
        let tailBox: ContentObject;
        switch (object.kind) {
            case UIObjectType.Single:
                tailBox = object.contents;
                break;
            case UIObjectType.Pair:
                headBox = object.lhs;
                tailBox = object.rhs;
                break;
        }

        let headBoxElt: HTMLDivElement | undefined;
        let headBoxTargetUnknown = false;

        if (headBox) {
            headBoxElt = preparedElt ?? document.createElement('div');
            headBoxElt.classList.add('bp--box');
            container.prepend(headBoxElt);
            
            switch (headBox.kind) {
                case ContentObjectType.Empty:
                    this.slashes.push(headBoxElt);
                    break;
                case ContentObjectType.String:
                    const valueContainer = document.createElement('span');
                    valueContainer.classList.add("bp--value-container")
                    valueContainer.innerText = headBox.value;
                    headBoxElt.appendChild(valueContainer);
                    break;
                case ContentObjectType.Rich:
                    for (const elt of headBox.children) {
                        headBoxElt.appendChild(elt);
                    }
                    break;
                case ContentObjectType.Pointer:
                    const target = this.objectToEltBindings.get(headBox.target);
                    if (target) {
                        this.arrowBindings.push({ from: headBoxElt, to: target, side: "unknown" })
                    }
                    else {
                        headBoxTargetUnknown = true;
                    }
                    break;
            }
        }

        // tailBox
        let tailBoxElt = headBox ? document.createElement('div') : preparedElt ?? document.createElement('div');
        tailBoxElt.classList.add('bp--box');
        container.appendChild(tailBoxElt);
        
        switch (tailBox.kind) {
            case ContentObjectType.Empty:
                this.slashes.push(tailBoxElt);
                break;
            case ContentObjectType.String:
                const valueContainer = document.createElement('span');
                valueContainer.classList.add("bp--value-container")
                valueContainer.innerText = tailBox.value;
                tailBoxElt.appendChild(valueContainer);
                break;
            case ContentObjectType.Rich:
                for (const elt of tailBox.children) {
                    tailBoxElt.appendChild(elt);
                }
                break;
            case ContentObjectType.Pointer:
                const target = this.objectToEltBindings.get(tailBox.target);
                if (target) {
                    this.arrowBindings.push({ from: tailBoxElt, to: target, side: "unknown" });
                }
                else {
                    const to = this.renderFromBoxObject(tailBox.target, row);
                    this.arrowBindings.push({ from: tailBoxElt, to, side: to.classList.contains("bp--box") ? "Left" : "unknown" });
                }
                break;
        }

        // Delaying this was necessary to make sure the recursive calls run in the correct order.
        if (headBoxTargetUnknown) {
            const to = this.renderFromBoxObject((headBox as PointerObject).target, this.pushRow([...row.children].slice(0, position)));
            this.arrowBindings.push({ from: headBoxElt!, to, side: to.classList.contains("bp--box") ? "Top" : "unknown" });
        }

        return headBoxElt ?? tailBoxElt;
    }
}

customElements.define('box-and-pointer', BoxAndPointerElement);