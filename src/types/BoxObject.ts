import type { ContentObject } from "./ContentObject";

export enum UIObjectType {
    Single,
    Pair,
}

export interface SingleObject {
    kind: UIObjectType.Single;
    contents: ContentObject;
}

export function makeSingle(x: Omit<SingleObject, 'kind'>): SingleObject {
    return {
        ...x,
        kind: UIObjectType.Single
    };
}

export function isSingle(x: BoxObject): x is SingleObject {
    return x.kind === UIObjectType.Single;
}

export interface PairObject {
    kind: UIObjectType.Pair;
    lhs: ContentObject;
    rhs: ContentObject;
}

export function makePair(x: Omit<PairObject, 'kind'>): PairObject {
    return {
        ...x,
        kind: UIObjectType.Pair
    };
}

export function isPair(x: BoxObject): x is PairObject {
    return x.kind === UIObjectType.Pair;
}

export type BoxObject
    = SingleObject
    | PairObject
    ;
