export const getCountOfChar = (target: string, char: string): number => {
    let ct = 0;
    for (let i = 0; i < target.length; i++)
        if (target[i] === char)
            ct++;
    return ct;
};