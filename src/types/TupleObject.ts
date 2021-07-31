import type { ContentObject } from "./ContentObject";

export function makeTuple(...contents: ContentObject[]): TupleObject {
    return {
        contents
    };
}

export interface TupleObject {
    contents: ContentObject[];
}
