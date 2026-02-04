---
title: 'JavaScript指南'
date: '2026-02-04'
tags: ['JavaScript']
draft: false
summary: ''
---

实用的JavaScript编程技巧和解决方案

<!-- truncate -->

## 对象数组去重

```javascript
const data = [
  { ID: 1, name: '张三' },
  { ID: 2, name: '李四' },  // ID 重复！
  { ID: 2, name: '王五' },  // ID 重复！
  { ID: 2, name: '赵六' },
  { ID: 4, name: '钱七' }
];

const d = Array.from(new Map(data.map(item => [item.ID, item]) || []).values())

// output
// [
//   { ID: 1, name: '张三' },
//   { ID: 3, name: '赵六' },
//   { ID: 4, name: '钱七' }
// ]
```

## Excel 文件 MIME 类型

| 文件格式 | MIME 类型 |
|----------|-----------|
| xlsx     | application/vnd.openxmlformats-officedocument.spreadsheetml.sheet |
| xls      | application/vnd.ms-excel |

