import { TupleObject, makeTuple } from "./types/TupleObject";
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
            this.renderFromBoxObject(object, this.pushRow([], []), true);
        }

        for (const row of this.rows){
            // Don't add empty rows
            if (row.querySelector(".bp--box-container:not(.bp--hidden)")) {
                this.shadow.appendChild(row);
            }
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

    private search(node: TupleObject, callback: (node: TupleObject) => void) {
        const visited = new Set<TupleObject>();
        const _search = (node: TupleObject) => {
            if (visited.has(node)) {
                return;
            }
            visited.add(node);
            callback(node);
            for (const obj of node.contents) {
                if (obj.kind === ContentObjectType.Pointer) {
                    _search(obj.target);
                }
            }
        };
        _search(node);
    }

    private calculateGraphFromDOM(): TupleObject[] {
        const namedObjects: { [name: string]: TupleObject } = {};
        const refResolutionCallbacks: (() => void)[] = [];
        const graphRoots = [] as TupleObject[];
        const graphRootNames = new Set<string>();
        const noRootSymbol = Symbol();
        /**
         * Map from a named element to the names of every root whose tree is pointing to it.
         * If a tree pointing to it has no name, it will use noRootSymbol instead.
         */
        const graphRootRefGraph: { [name: string]: Set<string | typeof noRootSymbol> } = {};
        const rootElements = this.getChildren(this);
        const forcedRoots = new Set<TupleObject>();

        let $name: string | typeof noRootSymbol = noRootSymbol;

        const generateBoxObject = (element: InternalElement): TupleObject => {
            let object: TupleObject;
            switch (element.tagName) {
                case Tags.Box:
                    const [elt, ...extraElts] = this.getChildren(element, true);
                    for (const extraElt of extraElts) {
                        if (typeof extraElt === 'string') {
                            console.error("Found extraneous text node %o in %o could be interpreted as a value. Did you mean to use <tuple>?", extraElt, element);
                        }
                        else {
                            console.error("Found extraneous element %o in %o. Did you mean to use <tuple>?", extraElt, element);
                        }
                    }
                    if (!elt) {
                        console.error("<box> element %o contains no values, expected one.", element);
                        object = makeTuple(emptySingleton);
                    }
                    else {
                        object = makeTuple(typeof elt === 'string' ? makeString({ value: elt }) : generateContentObject(elt));
                    }
                    break;
                case Tags.Pair: {
                    const [lhsElt, rhsElt, ...extraElts] = this.getChildren(element, true);
                    for (const extraElt of extraElts) {
                        if (typeof extraElt === 'string') {
                            console.error("Found extraneous text node %o in %o could be interpreted as a value. Did you mean to use <tuple>?", extraElt, element);
                        }
                        else {
                            console.error("Found extraneous element %o in %o. Did you mean to use <tuple>?", extraElt, element);
                        }
                    }

                    if (!rhsElt) {
                        console.error("<pair> element %o only contains one value, expected two.", element);
                        object = makeTuple(
                            typeof lhsElt === 'string' ? makeString({ value: lhsElt }) : generateContentObject(lhsElt),
                            emptySingleton
                        );
                    }
                    else if (!lhsElt) {
                        console.error("<pair> element %o contains no values, expected two.", element);
                        object = makeTuple(
                            emptySingleton,
                            emptySingleton
                        );
                    }
                    else {
                        object = makeTuple(
                            typeof lhsElt === 'string' ? makeString({ value: lhsElt }) : generateContentObject(lhsElt),
                            typeof rhsElt === 'string' ? makeString({ value: rhsElt }) : generateContentObject(rhsElt)
                        );
                    }
                    break;
                }
                case Tags.Tuple: {
                    const elts = this.getChildren(element, true);
                    if (elts.length === 0) {
                        console.error("<tuple> element %o contains no values, expected at least one.", element);
                        object = makeTuple(
                            emptySingleton
                        );
                    }
                    else {
                        object = makeTuple(...elts.map(x => typeof x === 'string' ? makeString({ value: x }) : generateContentObject(x)));
                    }
                    break;
                }
                case Tags.List: {
                    const elts = this.getChildren(element, true);
                    if (elts.length === 0) {
                        object = makeTuple(emptySingleton);
                    }
                    else if (element.hasAttribute(Attributes.ExplicitTail)) {
                        const tailElt = elts[elts.length - 1];
                        const tail = typeof tailElt === 'string' ? makeString({ value: tailElt }) : generateContentObject(tailElt);

                        object = elts.slice(0, -1).reduceRight((prev, lhsElt) => makeTuple(
                            typeof lhsElt === 'string' ? makeString({ value: lhsElt }) : generateContentObject(lhsElt),
                            prev === null ? tail : makePointer({ target: prev })
                        ), null as TupleObject | null)!;
                    }
                    else {
                        object = elts.reduceRight((prev, lhsElt) => makeTuple(
                            typeof lhsElt === 'string' ? makeString({ value: lhsElt }) : generateContentObject(lhsElt),
                            prev === null ? emptySingleton : makePointer({ target: prev })
                        ), null as TupleObject | null)!;
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

                    const convertSExpressionToBoxObject = (expr: SExpression): TupleObject => {
                        return makeTuple(convertMaybeSExpressionToContentObject(expr.head), convertMaybeSExpressionToContentObject(expr.tail));
                    };

                    const parsed = sParse(element.innerText).head;
                    if (!(parsed instanceof SExpression)) {
                        console.error("%o is not valid content for a <lisp> element. Did you mean to surround it with parentheses?", element.innerText);
                        object = makeTuple(emptySingleton);
                    }
                    else {
                        object = convertSExpressionToBoxObject(parsed);
                    }
                    break;
                }
                default:
                    console.error("Found <%s> element, but only <box>, <pair>, <list>, and <lisp> elements are permitted here.", element.tagName.toLowerCase());
                    object = makeTuple(generateContentObject(element));
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
                    return makeRich({ content: element });
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

            const availableFrom = new Map<TupleObject, number>();
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
            
            const pathsToHistogram = [] as TupleObject[][];
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
    private objectToPreparedEltBindings = new Map<TupleObject, HTMLDivElement>();
    private objectToEltBindings = new Map<TupleObject, HTMLDivElement>();

    private pushRow(referencePadding: Element[], tuplePadding: Element[]): HTMLDivElement {
        const rowElt = document.createElement('div');
        rowElt.classList.add("bp--row");
        for (const elt of referencePadding) {
            const clone = elt.cloneNode(true) as Element;
            clone.classList.add("bp--hidden");
            rowElt.appendChild(clone);
        }
        if (tuplePadding.length > 0) {
            const tuplePaddingContainer = document.createElement('div');
            tuplePaddingContainer.classList.add("bp--box-container", "bp--hidden", "bp--tuple--padding");
            for (const tupleSegment of tuplePadding) {
                tuplePaddingContainer.appendChild(tupleSegment.cloneNode(true));
            }
            rowElt.appendChild(tuplePaddingContainer);
        }
        this.rows.push(rowElt);
        return rowElt;
    }

    private prepareRenderRoot(object: TupleObject) {
        this.objectToPreparedEltBindings.set(object, document.createElement('div'));
    }

    private renderFromBoxObject(object: TupleObject, row: HTMLDivElement, root = false): HTMLDivElement {
        let preparedElt = this.objectToPreparedEltBindings.get(object);
        if (!root && preparedElt) {
            return preparedElt;
        }

        const position = row.childElementCount;

        const container = document.createElement('div');
        container.classList.add('bp--box-container');
        row.appendChild(container);

        this.objectToEltBindings.set(object, container);

        const nonTailBoxes = object.contents.slice(0, -1);
        const tailBox = object.contents[object.contents.length - 1];

        const boxTargets = [] as [box: PointerObject, elt: HTMLDivElement, index: number][];
        const nonTailBoxElts = [] as HTMLDivElement[];
        
        for (let i = 0; i < nonTailBoxes.length; i++) {
            const box = nonTailBoxes[i];
            const boxElt = (box === nonTailBoxes[0] && preparedElt) || document.createElement('div');
            nonTailBoxElts.push(boxElt);
            boxElt.classList.add('bp--box');
            container.appendChild(boxElt);
            
            switch (box.kind) {
                case ContentObjectType.Empty:
                    this.slashes.push(boxElt);
                    break;
                case ContentObjectType.String:
                    const valueContainer = document.createElement('span');
                    valueContainer.classList.add("bp--value-container")
                    valueContainer.innerText = box.value;
                    boxElt.appendChild(valueContainer);
                    break;
                case ContentObjectType.Rich:
                    const valueElt = box.content.cloneNode(true) as HTMLElement;
                    valueElt.classList.add("bp--value-container");
                    boxElt.appendChild(valueElt);
                    break;
                case ContentObjectType.Pointer:
                    const target = this.objectToEltBindings.get(box.target);
                    if (target) {
                        this.arrowBindings.push({ from: boxElt, to: target, side: "unknown" });
                    }
                    else {
                        boxTargets.unshift([box, boxElt, i]);
                    }
                    break;
            }
        }

        const tailBoxElt = nonTailBoxes.length > 0 ? document.createElement('div') : preparedElt ?? document.createElement('div');
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
                const valueElt = tailBox.content.cloneNode(true) as HTMLElement;
                valueElt.classList.add("bp--value-container");
                tailBoxElt.appendChild(valueElt);
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
        for (const [box, boxElt, i] of boxTargets) {
            const to = this.renderFromBoxObject((box as PointerObject).target, this.pushRow([...row.children].slice(0, position), nonTailBoxElts.slice(0, i)));
            this.arrowBindings.push({ from: boxElt!, to, side: to.classList.contains("bp--box") ? "Top" : "unknown" });
        }

        return nonTailBoxElts[0] ?? tailBoxElt;
    }
}

customElements.define('box-and-pointer', BoxAndPointerElement);