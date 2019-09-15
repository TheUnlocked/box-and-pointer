import SExpression from "./sexpr.js";
import { TokenType, BracketDirection, BracketShape, tokenize } from "./tokenizer.js";

export const parse = (input: string): SExpression => {
    let bracketStack: BracketShape[] = [];
    let sexprStack: SExpression[] = [];
    let originalSexpr: SExpression = new SExpression();
    let currentSexpr: SExpression = originalSexpr;
    let dottedSexprs: SExpression[] = [];
    let errorList: {pos: {row: number, col: number}, message: string}[] = [];
    for(let token of tokenize(input)){
        try{
            if (token.type === TokenType.Bracket){
                let bracket: {shape: BracketShape, dir: BracketDirection} = token.value;
                if (bracket.dir === BracketDirection.Start){
                    bracketStack.push(bracket.shape);
                    if (dottedSexprs[dottedSexprs.length-1] === currentSexpr){
                        if (currentSexpr.tail !== undefined){
                            errorList.push({pos: token.positionInfo, message: "A dot may only be followed by one value."});
                            dottedSexprs.pop();
                        }
                        else{
                            currentSexpr.tail = new SExpression();
                            sexprStack.push(currentSexpr);
                            currentSexpr = currentSexpr.tail;
                            continue;
                        }
                    }
                    if (currentSexpr.head !== undefined){
                        currentSexpr.tail = new SExpression();
                        currentSexpr = currentSexpr.tail;
                    }
                    currentSexpr.head = new SExpression();
                    sexprStack.push(currentSexpr);
                    currentSexpr = currentSexpr.head;
                }
                else{
                    if (dottedSexprs.length > 0 && dottedSexprs[dottedSexprs.length-1] === currentSexpr){
                        if (currentSexpr.tail === undefined){
                            errorList.push({pos: token.positionInfo, message: "A dot must have a value following it."});
                        }
                        dottedSexprs.pop();
                    }
                    if (bracketStack[bracketStack.length-1] !== bracket.shape){
                        errorList.push({pos: token.positionInfo, message: "Mismatched closing bracket."});
                        while (bracketStack.length > 0 && bracketStack.pop() !== bracket.shape){
                            if (dottedSexprs.length > 0 && dottedSexprs[dottedSexprs.length-1] === currentSexpr){
                                dottedSexprs.pop();
                            }
                            currentSexpr.tail = currentSexpr.tail || null;
                            currentSexpr = sexprStack.pop()!;
                        }
                    }
                    if (currentSexpr.head === undefined){
                        const innerSexpr = currentSexpr;
                        currentSexpr = sexprStack.pop()!;
                        if (currentSexpr === undefined){
                            errorList.push({pos: token.positionInfo, message: "Missing closing bracket."});
                        }
                        else{
                            if (currentSexpr.head === innerSexpr){
                                currentSexpr.head = null;
                            }
                            else if (currentSexpr.tail === innerSexpr){
                                currentSexpr.tail = null;
                            }
                        }
                    }
                    else{
                        currentSexpr.tail = currentSexpr.tail || null;
                        currentSexpr = sexprStack.pop()!;
                        if (currentSexpr === undefined){
                            errorList.push({pos: token.positionInfo, message: "Missing closing bracket."});
                        }
                    }
                }
            }
            else if (token.type === TokenType.Name){
                if (dottedSexprs.length > 0 && dottedSexprs[dottedSexprs.length-1] === currentSexpr){
                    if (currentSexpr.tail !== undefined){
                        errorList.push({pos: token.positionInfo, message: "A dot may only be followed by one value."});
                        dottedSexprs.pop();
                    }
                    else{
                        currentSexpr.tail = token.value;
                        continue;
                    }
                }
                if (currentSexpr.head !== undefined){
                    currentSexpr.tail = new SExpression();
                    currentSexpr = currentSexpr.tail;
                }
                currentSexpr.head = token.value;
            }
            else if (token.type === TokenType.Dot){
                if (currentSexpr.head === undefined){
                    errorList.push({pos: token.positionInfo, message: "A dot must have a value preceeding it."});
                }
                else{
                    dottedSexprs.push(currentSexpr);
                }
            }
        }
        catch(e){
            console.error(e);
        }
    }
    currentSexpr.tail = currentSexpr.tail || null;
    errorList.length > 0 && console.error(errorList.map(x => `${x.pos.row}, ${x.pos.col}: ${x.message}`).join("\n"));
    return originalSexpr;
}