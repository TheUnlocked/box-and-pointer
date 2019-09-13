# box-and-pointer
 HTML WebElement for box and pointer diagrams

Sample usage:

```html
<!DOCTYPE html>
<html>
<head>
    <!-- Currently necessary to include this dependency in a <script> tag -->
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jsPlumb/2.11.2/js/jsplumb.min.js"></script>
    <!-- Currently necessary to include this stylesheet in a <link> tag. The id is important! -->
    <link id="boxpointerss" rel="stylesheet" href="./box-and-pointer.css" />
    <!-- The actual script -->
    <script src="./dist/box-and-pointer.js" type="module"></script>
</head>
<body>
    <box-and-pointer>
        <list origin explicit-tail>
            1
            <list> 2 <box ref="8"></box> 3 </list>
            <pair>
                <pair> 4 <box ref="5"></box> </pair>
                <list name="5"> 5 <!----> 6 </list>
            </pair>
            7
            <box ref="8"></box>
        </list>
        <list name="8"> 8 <!----> 9 </list>
    </box-and-pointer>
</body>
</html>
```
![](images/listsample1.png)