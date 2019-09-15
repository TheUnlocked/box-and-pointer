export default class SExpression {
    public head: any;
    public tail: any;

    constructor();
    constructor(head: any);
    constructor(head?: any, tail?: any){
        this.head = head;
        this.tail = tail;
    }

    public toString(): string{
        let result = "";
        if (this.head instanceof SExpression){
            result += `(${this.head.toString()})`;
        }
        else if (this.head === null){
            result += '()';
        }
        else{
            result += this.head;
        }
        if (this.tail === null){
        }
        else if (this.tail instanceof SExpression){
            result += ` ${this.tail.toString()}`;
        }
        else{
            result += ` . ${this.tail}`;
        }
        
        return result;
    }
}