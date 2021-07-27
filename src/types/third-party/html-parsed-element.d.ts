declare module 'html-parsed-element' {
    export default abstract class HTMLParsedElement extends HTMLElement {
        parsedCallback(): Promise<void>;
    }
}