export enum Tags {
    // Box Elements
    Box = 'BOX',
    Pair = 'PAIR',
    List = 'LIST',
    Lisp = 'LISP',

    // Value Elements
    Value = 'VALUE',
    Pointer = 'POINTER',
    Empty = 'EMPTY',
}

export enum Attributes {
    Name = 'name',
    Ref = 'ref',
    ExplicitTail = 'explicit-tail',
    ForceRoot = 'force-root'
}

export const internalElementTagNames = new Set(Object.values(Tags));

export declare class BoxElement extends HTMLElement {
    tagName: Tags.Box;
}

export declare class PairElement extends HTMLElement {
    tagName: Tags.Pair;
}

export declare class ListElement extends HTMLElement {
    tagName: Tags.List;
}

export declare class ValueElement extends HTMLElement {
    tagName: Tags.Value;
}

export declare class PointerElement extends HTMLElement {
    tagName: Tags.Pointer;
}

export declare class EmptyElement extends HTMLElement {
    tagName: Tags.Empty;
}

export declare class LispElement extends HTMLElement {
    tagName: Tags.Lisp;
}

export type InternalElement
    = BoxElement
    | PairElement
    | ListElement
    | ValueElement
    | PointerElement
    | EmptyElement
    | LispElement
    ;