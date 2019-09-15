import { getCountOfChar } from "./helper.js";

const whitespace = " \n\r\t";
const brackets = "()[]{}";

export const tokenize = function* (input: string): IterableIterator<Token>{
    let i = 0;
    let line = 1;
    let chr = 0;
    let token = "";
    while (i < input.length){
        if (input[i] === ";"){
            while (input[++i] !== "\n");
            i++;
        }
        else if (whitespace.includes(input[i])){
            if (token !== ""){
                yield new Token(TokenType.Name, token, {row: line, col: chr});
                token = "";
                chr += token.length;
            }
            else if (input[i] === "\n"){
                line++;
                chr = 1;
            }
            chr++;
            i++;
        }
        else if (brackets.includes(input[i])){
            if (token !== ""){
                yield new Token(TokenType.Name, token, {row: line, col: chr});
                token = "";
                chr += token.length;
            }
            yield new Token(TokenType.Bracket, BracketIdentifier[input[i++]], {row: line, col: chr++});
        }
        else if (input[i] === "\""){
            if (token !== ""){
                yield new Token(TokenType.Name, token, {row: line, col: chr});
                token = "";
                chr += token.length;
            }
            let j = i + 1;
            while (j < input.length){
                j = input.indexOf("\"", j)
                if (j === -1){
                    break;
                }
                let escapeCount = 0;
                for (let k = 1; input[j-k] === "\\"; k++){
                    escapeCount++;
                }
                if (escapeCount % 2 == 0){
                    let str = input.substring(i, j + 1);
                    yield new Token(TokenType.Name, str, {row: line, col: chr});
                    let newlines = getCountOfChar(str, "\n");
                    line += newlines;
                    if (newlines > 0){
                        chr = str.length - str.lastIndexOf("\n");
                    }
                    else{
                        chr += str.length;
                    }
                    i = j + 1;
                    break;
                }
                else{
                    j++;
                }
            }
            if (j === -1){
                return;
            }
        }
        else if (token === "" && input[i] === '.'){

            yield new Token(TokenType.Dot, '.', {row: line, col: chr});
            chr++;
            i++;
        }
        else{
            token += input[i++];
        }
    }
    if (token !== ""){
        yield new Token(TokenType.Name, token, {row: line, col: chr});
        token = "";
        chr += token.length;
    }
}

class Token {
    public type: TokenType;
    public value: any;
    public positionInfo: {row: number, col: number};
    
    constructor(type: TokenType, value: any, positionInfo: {row: number, col: number}){
        this.type = type;
        this.value = value;
        this.positionInfo = positionInfo;
    }
}

export enum TokenType {
    Bracket,
    Name,
    Dot
}

export enum BracketDirection {
    Start,
    End
}
export enum BracketShape {
    Paren,
    Curly,
    Square
}

const BracketIdentifier: {[bracket: string]: {shape: BracketShape, dir: BracketDirection}} = {
    "(": {shape: BracketShape.Paren, dir: BracketDirection.Start},
    ")": {shape: BracketShape.Paren, dir: BracketDirection.End},
    "{": {shape: BracketShape.Curly, dir: BracketDirection.Start},
    "}": {shape: BracketShape.Curly, dir: BracketDirection.End},
    "[": {shape: BracketShape.Square, dir: BracketDirection.Start},
    "]": {shape: BracketShape.Square, dir: BracketDirection.End}
};