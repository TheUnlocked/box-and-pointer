# box-and-pointer
HTML WebElement for box and pointer diagrams

<strike>[Click here for a quick start tutorial.](https://github.com/TheUnlocked/box-and-pointer/wiki/Quick-Start)</strike>  
Currently the tutorial is out of date. While some things are the same, there have been some breaking changes, and many of the samples and explanations are no longer valid.

## Sample

```html
<!DOCTYPE html>
<html>
<head>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jsPlumb/2.11.2/js/jsplumb.min.js"></script>
    <link id="box-and-pointer-style" rel="stylesheet" href="./box-and-pointer/box-and-pointer.css" />
    <script src="./box-and-pointer/box-and-pointer.js"></script>
</head>
<body>
    <box-and-pointer>
        <list explicit-tail>
            1
            <list>
                2
                <pointer ref="8"></pointer>
                3
            </list>
            <pair>
                <pair>4 <pointer ref="5"></pointer></pair>
                <list name="5">5 6</list>
            </pair>
            7
            <pointer ref="8"></pointer>
        </list>
        <list name="8">8 9</list>
    </box-and-pointer>
</body>
</html>
```
![](images/listsample1.png)

## Credit
* Pointers rendered using [jsPlumb](https://github.com/jsplumb/jsplumb).
* Visual design algorithm based off of the box-and-pointer diagrams at [scheme.cs61a.org](https://scheme.cs61a.org/).
* Uses [html-parsed-element](https://github.com/WebReflection/html-parsed-element) to render only after the internal HTML node structure has been built.
* Built with [TypeScript](http://typescriptlang.org).
* [Webpack](https://webpack.js.org)
