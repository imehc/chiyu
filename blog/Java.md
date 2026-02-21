---
title: 'Java 文档生成工具'
date: '2021-08-26 21:38'
tags: ['Java']
draft: false
summary: '使用 javadoc 工具生成 Java 代码注释文档的基本命令'
---

# Java 文档生成工具

<!-- truncate -->

## 生成注释文档

```bash
javadoc -d 文档输出目录 -注释名 class文件
```

### 示例命令

```bash
javadoc -d D:\javacode\doc -author -version Hello.java
```

**参数说明**：

| 参数 | 说明 |
|------|------|
| `-d` | 指定文档输出目录 |
| `-author` | 包含 `@author` 标签信息 |
| `-version` | 包含 `@version` 标签信息 |
| `Hello.java` | 要生成文档的 `Java` 源文件 |
