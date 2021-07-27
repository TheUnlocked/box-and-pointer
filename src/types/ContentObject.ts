import { BoxObject } from "./BoxObject";

export enum ContentObjectType {
    Pointer,
    String,
    Rich,
    Empty,
}

export interface PointerObject {
    kind: ContentObjectType.Pointer;
    target: BoxObject;
}

export function makePointer(x: Omit<PointerObject, 'kind'>): PointerObject {
    return {
        ...x,
        kind: ContentObjectType.Pointer
    };
}

export function makeNullPointer(): PointerObject {
    return {
        kind: ContentObjectType.Pointer
    } as PointerObject;
}

export function transformContentObject<T extends ContentObject>(original: ContentObject, update: T): asserts original is T {
    Object.assign(original, update);
}

export function isPointer(x: ContentObject): x is PointerObject {
    return x.kind === ContentObjectType.Pointer;
}

export interface StringObject {
    kind: ContentObjectType.String;
    value: string;
}

export function makeString(x: Omit<StringObject, 'kind'>): StringObject {
    return {
        ...x,
        kind: ContentObjectType.String
    };
}

export function isString(x: ContentObject): x is StringObject {
    return x.kind === ContentObjectType.String;
}

export interface RichObject {
    kind: ContentObjectType.Rich;
    children: NodeListOf<ChildNode>;
}

export function makeRich(x: Omit<RichObject, 'kind'>): RichObject {
    return {
        ...x,
        kind: ContentObjectType.Rich
    };
}

export function isRich(x: ContentObject): x is RichObject {
    return x.kind === ContentObjectType.Rich;
}

export interface EmptyObject {
    kind: ContentObjectType.Empty;
}

export const emptySingleton = { kind: ContentObjectType.Empty } as EmptyObject;

export type ContentObject
    = PointerObject
    | StringObject
    | RichObject
    | EmptyObject
    ;