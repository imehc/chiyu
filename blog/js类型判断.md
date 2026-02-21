---
title: 'JavaScript 类型判断与核心 API 详解'
date: '2021-09-18 10:44'
tags: ['JavaScript', '类型判断', 'DOM', 'BOM', '正则表达式', 'Array', 'Object']
draft: false
summary: 'JavaScript 类型判断方法（typeof、instanceof、Object.prototype.toString）、Base64 编解码、对象操作、数组方法、二进制位运算、错误处理、DOM 操作等核心知识点'
---

## 类型判断

<!-- truncate -->

确定值是什么类型。

### `typeof`

```js
typeof 123 // 'number'
typeof '123' // 'string'
typeof false // 'boolean'
typeof undefined // 'undefined'

function f() {}
typeof f // 'function'
```

<!-- 
typeof 不能区分数组类型，因为它返回的是一个 'object'；
由于历史原因造成，也不能区分 null，它返回的是一个 'object' 类型。
typeof 可以对 JS 基础数据类型做出准确的判断，而对于引用类型返回的基本上都是 object
-->

### `instanceof`

`instanceof` 是用来判断 A 是否为 B 的实例，返回布尔值。

```js
[] instanceof Array // true
```

`instanceof` 一般用于引用类型判断。

### `Object.prototype.toString.call()`

能精确判断数据类型。

```js
Object.prototype.toString.call(数据源).slice(8, -1).toLowerCase()
// 或
Object.prototype.toString.call(数据源).match(/\[object (.*?)\]/)[1].toLowerCase()
```

---

## Base64 转码

可以将任意值转成 `0-9`、`a-z`、`A-Z`、`+`、`/` 这 64 个可打印字符，不是为了加密，而是为了不出现特殊字符，简化程序的处理。

`JS` 原生提供两个 `Base64` 相关的方法，注意：该方法不适合非 `ASCII` 码的字符，会报错。如果需要转换，必须中间插入一个转码环节，再使用这个方法。

```js
var str = 'Hello World!';
btoa(str); // 'SGVsbG8gV29ybGQh'
atob('SGVsbG8gV29ybGQh') // 'Hello World!'

btoa('你好'); // 报错

function b64Encode(str) {
  return btoa(encodeURIComponent(str));
  // encodeURIComponent 将字符串作为 URI 组件进行编码
}

function b64Decode(str) {
  return decodeURIComponent(atob(str));
  // decodeURIComponent 将 encodeURIComponent 编码的 URI 组件进行解码
}

b64Encode('你好') // "JUU0JUJEJUEwJUU1JUE1JUJE"
b64Decode('JUU0JUJEJUEwJUU1JUE1JUJE') // "你好"
```

---

## 对象操作

### `Object.keys`

查看一个对象本身的所有属性，可以使用 `Object.keys` 方法。

```js
var obj = {
  key1: 1,
  key2: 2
}
Object.keys(obj); // ['key1', 'key2']
```

### `delete`

删除一个对象的属性，可使用 `delete`。注意：删除一个不存在的属性，`delete` 不会报错，而且返回 `true`。

```js
var obj = { p: 1 };
Object.keys(obj) // ["p"]
delete obj.p // true
obj.p // undefined
Object.keys(obj) // []
```

只有在属性存在且不得删除，才会返回 `false`。注意：`delete` 只能删除对象本身的属性，无法删除继承的属性。

```js
var obj = Object.defineProperty({}, 'p', {
  value: 123,
  configurable: false
});
obj.p // 123
delete obj.p // false

var obj = {};
delete obj.toString // true
obj.toString // function toString() { [native code] }
```

### `in` 运算符

用于检查对象是否包含某个属性（检查的是键名，不是键值），返回布尔值。注意：`in` 运算符不能识别哪些属性是自身的，哪些属性是继承的。可使用 `obj.hasOwnProperty()` 判断是否为自身属性。

```js
var obj = { p: 1 }
'p' in obj; // true
'a' in obj; // false
'toString' in obj // true

obj.hasOwnProperty('toString') // false
```

---

## 函数

### `name` 属性

函数的 `name` 属性返回函数的名字。

```js
function f1() {}
f1.name; // 'f1'

var f2 = function() {}
f2.name; // 'f2'

var f3 = function myName() {}
f3.name; // 'myName'
```

`name` 属性的用处：可以获取参数函数的名字。

```js
var myFunc = function() {};

function test(f) {
  console.log(f.name);
}

test(myFunc) // myFunc
```

### `arguments` 对象

可以读取函数体内部所有参数，只能在函数体内部使用。

```js
// 正常模式下，arguments 对象可以在运行时修改，严格模式下修改不会影响到实际的函数参数
var f = function(a, b) {
  arguments[0] = 3;
  arguments[1] = 2;
  return a + b;
}
f(1, 1) // 5
```

`arguments.length` 可以判断函数调用传递参数的个数。注意：`arguments` 不是真正的数组，如果要使用数组的方法，需要将 `arguments` 转为真正的数组。

```js
var args = Array.prototype.slice.call(arguments);
// 或者
var args = [];
for (var i = 0; i < arguments.length; i++) {
  args.push(arguments[i])
}
```

---

## 二进制位运算符

### 否运算 `~`

所有的位运算都只对整数有效，二进制否运算遇到小数，也会将小数部分舍去，只保留整数部分。所以对一个小数进行两次否运算，可以达到取整效果。

```js
~~66.35654465; // 66
~~-654545.4654; // -654545
```

对字符串及其它类型进行否运算，会先调用 `Number` 函数转换为数值。

```js
~'011'; // -12
~'33 cats'; // -1
~'0xca'; // -203
~[] // -1
~NaN // -1
~null // -1
```

### 异或运算 `^`

异或运算也可以用来取整。

```js
12.9 ^ 0; // 12
-12.9 ^ 0; // -12
```

`^` 有一个特殊运用，连续对三个数进行三次异或运算，可以互换它们的值，这是互换两个变量的值的最快方法。

```js
var a = 10;
var b = 99;
a ^= b; b ^= a; a ^= b;
```

### 左移运算符 `<<`

二进制值向左移动指定的位数。

```js
4 << 1; // 8
// 相当于 4 * 2
-4 << 1; // -8
// 相当于 -4 * 2
2 << 2; // 8
// 相当于 2 * 4
```

将颜色的 `RGB` 值转为 `HEX` 值。

```js
var color = { r: 186, g: 218, b: 85 };

// RGB to HEX
// (1 << 24) 的作用为保证结果是 6 位数
var rgb2hex = function(r, g, b) {
  return '#' + ((1 << 24) + (r << 16) + (g << 8) + b)
    .toString(16) // 先转成十六进制，然后返回字符串
    .substr(1);   // 去除字符串的最高位，返回后面六个字符串
}

rgb2hex(color.r, color.g, color.b)
// "#bada55"
```

### 右移运算符 `>>`

右移运算可以模拟 2 的整除运算。

```js
5 >> 1; // 2
// 相当于 5 / 2 = 2
21 >> 2; // 5
// 相当于 21 / 4 = 5
21 >> 3; // 2
// 相当于 21 / 8 = 2
21 >> 4; // 1
// 相当于 21 / 16 = 1
```

### 头部补零右移运算符 `>>>`

与右移运算符只有一个差别，就是二进制形式向右移时，头部一律补零，而不考虑符号位，所以该运算总是得到正值。对于正数，与 `>>` 完全一致，区别主要在于负数。

```js
4 >>> 1; // 2
// 相当于 4 / 2

-4 >>> 1; // 2147483646
/*
  因为 -4 的二进制形式为 11111111 11111111 11111111 11111100，
  带符号位的右移一位，得到 01111111 11111111 11111111 11111110，
  即为十进制的 2147483646。
*/
```

---

## 其它运算符

### `void` 运算符

`void` 运算符的作用是执行一个表达式，然后不返回任何值，或者说返回 `undefined`。

```js
void 0 // undefined
void(0) // undefined
```

主要用途是在超链接插入代码防止网页跳转。

### `,` 运算符

`,` 用于对两个表达式求值，并返回后一个表达式的值。

```js
'a', 'b'; // 'b'
```

逗号运算符的一个用途是，在返回一个值之前，进行一些辅助操作。

```js
var value = (console.log('Hi!'), true);
// Hi!
value // true
```

上面代码中，先执行逗号之前的操作，然后返回逗号后面的值。

### `()`

函数放在圆括号中，会返回函数本身。如果圆括号紧跟在函数的后面，就表示调用函数。

```js
function f() { return 1; }
(f) // function f(){ return 1; }
f() // 1
```

---

## 数据类型的转换

### `Boolean`

除了 `undefined`、`null`、`0`、`NaN`、`''` 转换结果为 `false`，其他的值全部为 `true`。

### `Number`

```js
Number(324) // 324
Number('324abc') // NaN
Number('') // 0
Number(undefined) // NaN
Number(null) // 0
```

---

## 错误处理机制

### Error 实例对象

JavaScript 原生提供 `Error` 构造函数，所有抛出的错误都是这个构造函数的实例。

```js
var err = new Error('出错了');
err.message; // '出错了'
```

| 属性 | 说明 |
|------|------|
| `message` | 错误提示信息 |
| `name` | 错误名称（非标准属性） |
| `stack` | 错误的堆栈（非标准属性） |

```js
function throwit() {
  throw new Error('');
}

function catchit() {
  try {
    throwit();
  } catch (e) {
    console.log(e.stack); // print stack trace
  }
}

catchit()
/* 
  Error
    at throwit (<anonymous>:2:9)
    at catchit (<anonymous>:7:5)
    at <anonymous>:13:1
 */
```

`Error` 实例对象是最一般的错误类型，在它的基础上，JavaScript 还定义了其他 6 种错误对象。

- `SyntaxError`：解析代码时发生的语法错误。
- `ReferenceError`：引用一个不存在的变量时发生的错误。
- `RangeError`：一个值超出有效范围时发生的错误。
- `TypeError`：变量或参数不是预期类型时发生的错误。
- `URIError`：`URI` 相关函数的参数不正确时抛出的错误。
- `EvalError`：`eval` 函数没有被正确执行时抛出的错误（已经不再使用，为保证与以前代码兼容才保留）。

```js
var err1 = new Error('出错了！');
var err2 = new RangeError('出错了，变量超出有效范围！');
var err3 = new TypeError('出错了，变量类型无效！');

err1.message // "出错了！"
err2.message // "出错了，变量超出有效范围！"
err3.message // "出错了，变量类型无效！"
```

### 自定义错误

```js
function UserError(message) {
  this.message = message || '默认信息';
  this.name = 'UserError';
}

UserError.prototype = new Error();
UserError.prototype.constructor = UserError;

new UserError('这是自定义的错误')
```

### `throw` 语句

手动中断程序执行，抛出一个错误。

```js
var x = -1;
if (x <= 0) {
  throw new Error('x 必须为正数');
}
// Uncaught Error: x 必须为正数
```

`throw` 也可以抛出自定义错误。

```js
function UserError(message) {
  this.message = message || '默认信息';
  this.name = 'UserError';
}

throw new UserError('出错了！');
```

实际上，`throw` 可以抛出任何类型的值。

```js
throw 333; // Uncaught 333
throw {
  toString: function () {
    return 'Error!';
  }
};
// Uncaught { toString: ƒ }
```

### try...catch 结构

`catch` 代码块捕获错误之后，程序不会中断，会按照正常流程继续执行下去。

```js
try {
  foo.bar();
} catch (e) {
  if (e instanceof EvalError) {
    console.log(e.name + ": " + e.message);
  } else if (e instanceof RangeError) {
    console.log(e.name + ": " + e.message);
  }
  // ...
}
```

上面代码中，`catch` 捕获错误之后，会判断错误类型（`EvalError` 还是 `RangeError`），进行不同的处理。

### finally 代码块

`try...catch` 结构允许在最后添加一个 `finally` 代码块，表示不管是否出现错误，都必需在最后运行的语句。

```js
function cleansUp() {
  try {
    throw new Error('出错了……');
    console.log('此行不会执行');
  } catch (e) {
    console.log('捕捉到内部错误');
  } finally {
    console.log('完成清理工作');
  }
}

cleansUp()
// 捕捉到内部错误
// 完成清理工作
```

---

## console 对象与控制台

- `console.info`：与 `console.log` 用法一致，在最前面加一个蓝色图标
- `console.debug`：与 `console.log` 用法类似，但是默认情况下输出的信息不会显示，只有在打开显示级别在 `verbose` 的情况下才会显示
- `console.warn`：与 `console.log` 用法一致，在最前面加一个黄色三角，表示警告
- `console.error`：与 `console.log` 用法一致，在最前面加一个红色叉，表示出错
- `console.table`：对于某些复合类型的数据，`console.table` 方法可以将其转为表格显示
- `console.count`：方法用于计数，输出它被调用了多少次
- `console.dir`：方法用来对一个对象进行检查（inspect），并以易于阅读和打印的格式显示。该方法对于输出 `DOM`，会显示 `DOM` 对象的所有属性
- `console.dirxml`：输出 `HTML` 格式的 `DOM` 对象，如果是普通对象，与 `console.dir` 输出一致
- `console.assert`：方法主要用于程序运行过程中，进行条件判断，如果不满足条件，就显示一个错误，但不会中断程序执行
- `console.time` / `console.timeEnd`：这两个方法用于计时，可以算出一个操作所花费的准确时间
- `console.group` / `console.groupEnd`：这两个方法用于将显示的信息分组
- `console.groupCollapsed`：方法与 `console.group` 方法很类似，唯一区别是第一次显示时是收起的（`collapsed`），而不是展开的
- `console.trace`：方法显示当前执行的代码在堆栈中的调用路径
- `console.clear`：方法用于清除当前控制台的所有输出，将光标回置到第一行

---

## Object 对象

### Object.keys() 与 Object.getOwnPropertyNames()

`Object.keys()` 方法和 `Object.getOwnPropertyNames()` 方法都用来遍历对象的属性。

- `Object.keys` 方法的参数是一个对象，返回一个数组
- `Object.getOwnPropertyNames` 方法与 `Object.keys` 类似

对于一般的对象来说，`Object.keys()` 和 `Object.getOwnPropertyNames()` 返回的结果是一样的。只有涉及不可枚举属性时，才会有不一样的结果。

```js
var a = ['Hello', 'World'];
Object.keys(a) // ["0", "1"]
Object.getOwnPropertyNames(a) // ["0", "1", "length"]
// 数组的 length 属性是不可枚举的属性，所以只出现在 Object.getOwnPropertyNames 方法的返回结果中
```

由于 JavaScript 没有提供计算对象属性个数的方法，所以可以用这两个方法代替。

```js
var obj = {
  p1: 123,
  p2: 456
};
Object.keys(obj).length // 2
Object.getOwnPropertyNames(obj).length // 2
```

### 对象属性模型的相关方法

- `Object.getOwnPropertyDescriptor()`：获取某个属性的描述对象
- `Object.defineProperty()`：通过描述对象，定义某个属性
- `Object.defineProperties()`：通过描述对象，定义多个属性

### 控制对象状态的方法

- `Object.preventExtensions()`：防止对象扩展
- `Object.isExtensible()`：判断对象是否可扩展
- `Object.seal()`：禁止对象配置
- `Object.isSealed()`：判断一个对象是否可配置
- `Object.freeze()`：冻结一个对象
- `Object.isFrozen()`：判断一个对象是否被冻结

### 原型链相关方法

- `Object.create()`：该方法可以指定原型对象和属性，返回一个新的对象
- `Object.getPrototypeOf()`：获取对象的 `Prototype` 对象
- `Object.setPrototypeOf()`：为参数对象设置原型，返回该参数对象

```js
var a = {};
var b = { x: 1 };
Object.setPrototypeOf(a, b);
Object.getPrototypeOf(a) === b // true
a.x // 1
// 将对象 a 的原型，设置为对象 b，因此 a 可以共享 b 的属性

// new 命令可以使用 Object.setPrototypeOf 方法模拟
var F = function () {
  this.foo = 'bar';
};
var f = new F();
// 等同于
var f = Object.setPrototypeOf({}, F.prototype);
F.call(f);
```

### Object 的实例方法

- `Object.prototype.valueOf()`：返回当前对象对应的值，默认情况下返回对象本身
- `Object.prototype.toString()`：返回当前对象对应的字符串形式，默认情况下返回类型字符串
- `Object.prototype.toLocaleString()`：返回当前对象对应的本地字符串形式
- `Object.prototype.hasOwnProperty()`：判断某个属性是否为当前对象自身的属性，还是继承自原型对象的属性
- `Object.prototype.isPrototypeOf()`：判断当前对象是否为另一个对象的原型
- `Object.prototype.propertyIsEnumerable()`：判断某个属性是否可枚举

### 属性描述对象

属性描述对象提供 6 个元属性：

| 属性 | 说明 |
|------|------|
| `value` | 该属性的属性值，默认为 `undefined` |
| `writable` | 布尔值，表示属性值是否可改变，默认为 `true` |
| `enumerable` | 布尔值，表示该属性是否可遍历，默认为 `true` |
| `configurable` | 布尔值，表示属性的可配置性，默认为 `true` |
| `get` | 函数，表示该属性的取值函数（getter），默认为 `undefined` |
| `set` | 函数，表示该属性的存值函数（setter），默认为 `undefined` |

#### Object.getOwnPropertyDescriptor()

该方法可以获取属性描述对象。它的第一个参数是目标对象，第二个参数是一个字符串，对应目标对象的某个属性名。注意，`Object.getOwnPropertyDescriptor()` 方法只能用于对象自身的属性，不能用于继承的属性。

```js
var obj = { p: 'a' };
Object.getOwnPropertyDescriptor(obj, 'p')
// Object { value: "a",
//   writable: true,
//   enumerable: true,
//   configurable: true
// }
```

#### Object.defineProperty() 与 Object.defineProperties()

该方法允许通过属性描述对象，定义或修改一个属性，然后返回修改后的对象。

```js
Object.defineProperty(object, propertyName, attributesObject)
```

- `object`：属性所在的对象
- `propertyName`：字符串，表示属性名
- `attributesObject`：属性描述对象

```js
var obj = Object.defineProperty({}, 'p', {
  value: 123,
  writable: false, // 表示属性值是否可改变，默认为 true
  enumerable: true, // 表示该属性是否可遍历，默认为 true
  configurable: false // 表示属性的可配置性，默认为 true
});
obj.p // 123
obj.p = 246;
obj.p // 123
```

如果一次性定义或修改多个属性，可以使用 `Object.defineProperties()` 方法。

```js
var obj = Object.defineProperties({}, {
  p1: { value: 123, enumerable: true },
  p2: { value: 'abc', enumerable: true },
  p3: {
    get: function () { return this.p1 + this.p2 },
    enumerable: true,
    configurable: true
  }
});

obj.p1 // 123
obj.p2 // "abc"
obj.p3 // "123abc"
```

---

## Array 对象

### 常用方法

#### concat()

该方法用于多个数组的合并。它将新数组的成员，添加到原数组成员的后部，然后返回一个新数组，原数组不变。

#### reverse()

该方法用于颠倒排列数组元素，返回改变后的数组。注意，该方法将改变原数组。

#### slice()

该方法用于提取目标数组的一部分，返回一个新数组，原数组不变。如果 `slice()` 方法的参数是负数，则表示倒数计算的位置。`slice()` 方法的一个重要应用，是将类似数组的对象转为真正的数组。

```js
var a = ['a', 'b', 'c']
a.slice(1) // ["b", "c"]
a.slice(1, 2) // ["b"]
a.slice(-2, -1) // ["b"]

Array.prototype.slice.call(arguments);
```

#### splice()

该方法用于删除原数组的一部分成员，返回被截取的数组，并可以在删除的位置添加新的数组成员。返回值是被删除的元素。注意，该方法会改变原数组。

```js
// 第一个参数为开始截取的位置，第二个参数为截取的个数，第三个参数为新添加的数
var a = ['a', 'b', 'c', 'd', 'e', 'f'];
a.splice(4, 2) // ["e", "f"]

a.splice() // ['a', 'b', 'c', 'd', 'e', 'f']

a.splice(1, 2, 2, 3, 4) // ['b', 'c']
a // ['a', 2, 3, 4, 'd', 'e', 'f']
```

#### sort()

该方法对数组成员进行排序，默认是按照字典顺序排序。排序后，原数组将被改变。自定义方式排序，可以传入一个函数作为参数。

```js
[10111, 1101, 111].sort(function (a, b) {
  return a - b;
})
// 或
[1, 4, 2, 6, 0, 6, 2, 6].sort((a, b) => a - b)
```

#### map()

该方法将数组的所有成员依次传入参数函数，然后把每一次的执行结果组成一个新数组返回。

该方法的回调函数有三个参数：
1. 第一个为当前成员的值
2. 第二个为当前成员的位置
3. 第三个为数组本身

该方法还可以接受第二个参数，用来绑定回调函数内部的 `this` 变量。`map()` 方法不会跳过 `undefined` 和 `null`，但是会跳过空位。

```js
var arr = ['a', 'b', 'c'];

[1, 2].map(function (e) {
  return this[e];
}, arr) // ['b', 'c']
```

#### reduce() 与 reduceRight()

`reduce()` 方法和 `reduceRight()` 方法依次处理数组的每个成员，最终累计为一个值。它们的差别是，`reduce()` 是从左到右处理（从第一个成员到最后一个成员），`reduceRight()` 则是从右到左（从最后一个成员到第一个成员）。

```js
[1, 2, 3, 4, 5].reduce(function (a, b) {
  console.log(a, b);
  return a + b;
})
```

第一个参数是一个函数，函数接受以下四个参数：

| 参数 | 说明 |
|------|------|
| 累积变量 | 第一次执行时，默认为数组的第一个成员；以后每次执行时，都是上一轮的返回值 |
| 当前变量 | 第一次执行时，默认为数组的第二个成员；以后每次执行时，都是下一个成员 |
| 当前位置 | 一个整数，表示第二个参数（当前变量）的位置，默认为 1 |
| 原数组 | 整个数组 |

如果要对累积变量指定初值，可以把它放在 `reduce()` 方法和 `reduceRight()` 方法的第二个参数。

```js
[1, 2, 3, 4, 5].reduce(function (a, b) {
  return a + b;
}, 10);
// 25
```

#### indexOf() 与 lastIndexOf()

`indexOf` 方法返回给定元素在数组中第一次出现的位置，如果没有出现则返回 `-1`。

`indexOf` 方法还可以接受第二个参数，表示搜索的开始位置。

```js
['a', 'b', 'c'].indexOf('b') // 1
['a', 'b', 'c'].indexOf('a', 1) // -1
```

`indexOf` 方法从左向右，`lastIndexOf` 从右向左。

注意，这两个方法不能用来搜索 `NaN` 的位置。

---

## 包装对象

指的是与数值、字符串、布尔值分别相对应的 `Number`、`String`、`Boolean` 三个原生对象。这三个原生对象可以把原始类型的值变成（包装成）对象。

`valueOf` 返回实例对应的原始值。

```js
if (new Boolean(false)) { console.log('true'); } // true
if (new Boolean(false).valueOf()) { console.log('true'); } // 无输出
```

双重的否运算符（`!!`）可以将任意值转为对应的布尔值。

```js
!!undefined // false
!!null // false
!!0 // false
!!'' // false
!!NaN // false

!!1 // true
!!'false' // true
!![] // true
!!{} // true
!!function(){} // true
!!/foo/ // true
```

---

## Number 对象

### 静态属性

- `Number.POSITIVE_INFINITY`：正的无限，指向 `Infinity`
- `Number.NEGATIVE_INFINITY`：负的无限，指向 `-Infinity`
- `Number.NaN`：表示非数值，指向 `NaN`
- `Number.MIN_VALUE`：表示最小的正数（即最接近 0 的正数，在 64 位浮点数体系中为 `5e-324`）
- `Number.MAX_SAFE_INTEGER`：表示能够精确表示的最大整数，即 `9007199254740991`
- `Number.MIN_SAFE_INTEGER`：表示能够精确表示的最小整数，即 `-9007199254740991`

### 实例方法

#### Number.prototype.toFixed()

该方法将一个数转为指定位数的小数，然后返回这个小数对应的字符串。

```js
(10).toFixed(2) // "10.00"
10.005.toFixed(2) // "10.01"
```

#### Number.prototype.toExponential()

该方法用于将一个数转为科学计数法形式。

```js
(10).toExponential()  // "1e+1"
(10).toExponential(2) // "1.00e+1"
```

#### Number.prototype.toPrecision()

该方法用于将一个数转为指定位数的有效数字。

```js
(12.34).toPrecision(1) // "1e+1"
(12.34).toPrecision(2) // "12"
(12.34).toPrecision(3) // "12.3"
(12.34).toPrecision(4) // "12.34"
(12.34).toPrecision(5) // "12.340"
```

#### Number.prototype.toLocaleString()

该方法接受一个地区码作为参数，返回一个字符串，表示当前数字在该地区的当地书写形式。

```js
(123).toLocaleString('zh-Hans-CN-u-nu-hanidec') // '一二三'

(123).toLocaleString('zh-Hans-CN', { style: 'percent' }) // '12,300%'

// 如果 style 属性的值为 currency，则可以搭配 currency 属性，输出指定格式的货币字符串形式
(123).toLocaleString('zh-Hans-CN', { style: 'currency', currency: 'CNY' }) // '¥123.00'
(123).toLocaleString('en-US', { style: 'currency', currency: 'USD' }) // '$123.00'
(123).toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
// "123,00 €"
```

---

## String 对象

### 静态方法

#### String.fromCharCode()

该方法的参数是一个或多个数值，代表 Unicode 码点，返回值是这些码点组成的字符串。

```js
String.fromCharCode() // ""
String.fromCharCode(97) // "a"
String.fromCharCode(104, 101, 108, 108, 111) // "hello"
```

### 实例方法

- `String.prototype.charAt()`：返回指定位置的字符，参数是从 0 开始编号的位置
- `String.prototype.charCodeAt()`：返回字符串指定位置的 Unicode 码点（十进制表示）
- `String.prototype.concat()`：用于连接两个字符串，返回一个新字符串，不改变原字符串
- `String.prototype.slice()`：同数组 `slice`
- `String.prototype.substring()`：用于从原字符串取出子字符串并返回，不改变原字符串
- `String.prototype.match()`：用于确定原字符串是否匹配某个子字符串
- `String.prototype.search()`：返回匹配的第一个位置，如果没有找到匹配，则返回 `-1`
- `String.prototype.split()`：按照给定规则分割字符串，返回一个由分割出来的子字符串组成的数组
- `String.prototype.localeCompare()`：用于比较两个字符串

---

## Math 对象

### 随机数生成

任意范围的随机数生成函数：

```js
function getRandomArbitrary(min, max) {
  return Math.random() * (max - min) + min;
}

getRandomArbitrary(1.0, 6.6) // 5.068206129152702
```

任意范围的随机整数生成函数：

```js
function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

getRandomInt(1, 6) // 3
```

返回随机字符的例子：

```js
function random_str(length) {
  var ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  ALPHABET += 'abcdefghijklmnopqrstuvwxyz';
  ALPHABET += '0123456789-_';
  var str = '';
  for (var i = 0; i < length; ++i) {
    var rand = Math.floor(Math.random() * ALPHABET.length);
    str += ALPHABET.substring(rand, rand + 1);
  }
  return str;
}

random_str(6) // 'VgqCbg'
```

---

## Date 对象

### 静态方法

#### Date.parse()

该方法用来解析日期字符串，返回该时间距离时间零点（1970 年 1 月 1 日 00:00:00）的毫秒数。

```js
Date.parse('2021-09-16') // 1631750400000
// 如果解析失败，返回 NaN
```

### 本地时间字符串

以下三种方法，可以将 `Date` 实例转为表示本地时间的字符串：

- `Date.prototype.toLocaleString()`：完整的本地时间
- `Date.prototype.toLocaleDateString()`：本地日期（不含小时、分和秒）
- `Date.prototype.toLocaleTimeString()`：本地时间（不含年月日）

```js
var d = new Date(2021, 9, 16); // 不传入参数为当前时间
d.toLocaleString() // '2021/10/16 上午12:00:00'
d.toLocaleDateString() // '2021/9/16'
d.toLocaleTimeString() // '上午12:00:00'
```

---

## RegExp 对象

### 实例方法

#### RegExp.prototype.exec()

正则实例对象的 `exec()` 方法，用来返回匹配结果。如果发现匹配，就返回一个数组，成员是匹配成功的子字符串，否则返回 `null`。

```js
// 利用 g 修饰符允许多次匹配的特点，可以用一个循环完成全部匹配
var reg = /a/g;
var str = 'abc_aac_csda'

while (true) {
  var match = reg.exec(str);
  if (!match) break;
  console.log('#' + match.index + ':' + match[0]);
}
// #0:a
// #4:a
// #5:a
// #11:a
```

### 正则表达式语法

#### 特殊字符

- `.`（点字符）：匹配除回车（`\r`）、换行（`\n`）、行分隔符（`\u2028`）和段分隔符（`\u2029`）以外的所有字符
- `^`（位置字符）：表示字符串的开始位置
- `$`（位置字符）：表示字符串的结束位置
- `|`（选择符）：在正则表达式中表示"或关系"（OR）

#### 转义符

正则表达式中那些有特殊含义的元字符，如果要匹配它们本身，就需要在它们前面加上反斜杠。需要反斜杠转义的字符一共有 12 个：`^`、`.`、`[`、`$`、`(`、`)`、`|`、`*`、`+`、`?`、`{` 和 `\`。

#### 字符类

- `[^]`（脱字符）：表示除了字符类之中的字符，其他字符都可以匹配
- `-`（连字符）：表示字符的连续范围

#### 预定义模式

| 模式 | 说明 |
|------|------|
| `\d` | 匹配 0-9 之间的任一数字，相当于 `[0-9]` |
| `\D` | 匹配所有 0-9 以外的字符，相当于 `[^0-9]` |
| `\w` | 匹配任意的字母、数字和下划线，相当于 `[A-Za-z0-9_]` |
| `\W` | 除所有字母、数字和下划线以外的字符，相当于 `[^A-Za-z0-9_]` |
| `\s` | 匹配空格（包括换行符、制表符、空格符等） |
| `\S` | 匹配非空格的字符 |
| `\b` | 匹配词的边界 |
| `\B` | 匹配非词边界 |

#### 重复类

模式的精确匹配次数，使用大括号（`{}`）表示。`{n}` 表示恰好重复 n 次，`{n,}` 表示至少重复 n 次，`{n,m}` 表示重复不少于 n 次，不多于 m 次。

```js
/lo{2}k/.test('look') // true
/lo{2,5}k/.test('looook') // true
```

#### 量词符

- `?`：问号表示某个模式出现 0 次或 1 次，等同于 `{0, 1}`
- `*`：星号表示某个模式出现 0 次或多次，等同于 `{0,}`
- `+`：加号表示某个模式出现 1 次或多次，等同于 `{1,}`

<!-- 贪婪模式：会一直匹配到字符不出现为止 -->
<!-- 非贪婪模式：只要一发现匹配，就返回结果 -->
<!-- 将贪婪模式改为非贪婪模式，可以在量词符后面加一个问号 ? -->

#### 修饰符

- `g`：表示全局匹配
- `i`：忽略大小写（ignoreCase）
- `m`：表示多行模式（multiline）

#### 组匹配

正则表达式的括号表示分组匹配，括号中的模式可以用来匹配分组的内容。

```js
/fred+/.test('fredd') // true 表示重复字母 d
/(fred)+/.test('fredfred') // true 表示匹配 fred 这个词

var m = 'abcabc'.match(/(.)b(.)/);
m
// ['abc', 'a', 'c']
// 正则表达式 /(.)b(.)/ 一共使用两个括号，第一个括号捕获 a，第二个括号捕获 c
// 注意，使用组匹配时，不宜同时使用 g 修饰符，否则 match 方法不会捕获分组的内容
```

#### 非捕获组

`(?:x)` 称为非捕获组（Non-capturing group），表示不返回该组匹配的内容。

```js
var m = 'abc'.match(/(?:.)b(.)/);
m // ["abc", "c"]
// 第一个括号是非捕获组，所以最后返回的结果中没有第一个括号，只有第二个括号匹配的内容
```

#### 先行断言与先行否定断言

- `x(?=y)`：先行断言（Positive look-ahead），x 只有在 y 前面才匹配
- `x(?!y)`：先行否定断言（Negative look-ahead），x 只有不在 y 前面才匹配

---

## 实例对象与 new 命令

### new.target

函数内部可以使用 `new.target` 属性。如果当前函数是 `new` 命令调用，`new.target` 指向当前函数，否则为 `undefined`。

```js
function f() {
  console.log(new.target === f);
}
f() // false
new f() // true

// 使用这个属性，可以判断函数调用的时候，是否使用 new 命令
function F() {
  if (!new.target) {
    throw new Error('请使用 new 命令调用')
  }
}
F() // Uncaught Error: 请使用 new 命令调用
```

### Object.create()

现有的对象作为模板，生成新的实例对象。

```js
var person1 = {
  name: 'zhangsan',
  age: 23,
  greeting: function() {
    console.log(`I'm ${this.name}`)
  }
}

var person2 = Object.create(person1);
person2.name // 'zhangsan'
person2.greeting()

// 对象 person1 是 person2 的模板，后者继承了前者的属性和方法

// 如果想要生成一个不继承任何属性（比如没有 toString() 和 valueOf() 方法）的对象，可以将 Object.create() 的参数设为 null
var obj = Object.create(null);
obj.valueOf() // 报错
```

---

## 绑定 this 的方法

### Function.prototype.call()

函数实例的 `call` 方法，可以指定函数内部 `this` 的指向（即函数执行时所在的作用域），然后在所指定的作用域中，调用该函数。`call` 方法还可以接受多个参数：第一个参数是所要指向的那个对象，后面的参数则是函数调用时所需的参数。

```js
var obj = {};
var f = function () {
  return this;
};
f() === window // true
f.call(obj) === obj // true

function add(a, b) {
  return a + b;
}
add.call(this, 1, 2) // 3

// call 方法的一个应用是调用对象的原生方法
var obj = {};
obj.hasOwnProperty('toString') // false
// 覆盖继承的 hasOwnProperty 方法
obj.hasOwnProperty = function() {
  return true;
}
obj.hasOwnProperty('toString') // true
Object.prototype.hasOwnProperty.call(obj, 'toString') // false
```

### Function.prototype.apply()

该方法的作用与 `call` 方法类似。区别是该方法以数组方式传递参数。

```js
var a = [10, 2, 3, 4, 54, 9];
Math.max.apply(null, a) // 54
```

### Function.prototype.bind()

该方法用于将函数体内的 `this` 绑定到某个对象，然后返回一个新函数。函数不会立即调用，`call` 和 `apply` 会立即调用函数。

```js
var d = new Date();
var print = d.getTime.bind(d);
print()
```

### constructor 属性

<!-- 如果不能确定 constructor 属性是什么函数，可以通过 name 属性，从实例得到函数的名称 -->

```js
function Foo() {}
var f = new Foo();
f.constructor.name; // 'Foo'
```

### instanceof 运算符

该运算符返回一个布尔值，表示对象是否为某个构造函数的实例。

```js
var v = new Vehicle();
v instanceof Vehicle; // true
// 等价于
Vehicle.prototype.isPrototypeOf(v); // 检查某个对象是否为另一个对象的原型
```