---
title: 'Webpack 核心配置与优化指南'
date: '2021-08-04 11:51'
tags: ['Webpack', 'JavaScript']
draft: false
summary: 'Webpack 基础配置、Loader、Plugin、DevServer、性能优化（HMR、Tree Shaking、Code Splitting、缓存等）完整指南'
---

## Webpack 基础

{/* truncate */}

### 安装

```bash
npm i webpack webpack-cli -D
# 安装开发依赖

npm i css-loader style-loader -D
# loader 需要单独下载
```

### 命令行打包

```bash
# 开发环境打包
webpack ./src/index.js -o ./build/built.js --mode=development
# webpack 会以 ./src/index.js 为入口文件开始打包，打包后输出到 ./build/built.js，整体打包环境是开发环境

# 生产环境打包
webpack ./src/index.js -o ./build/built.js --mode=production
# 同上，整体打包环境为生产环境

# 结论：webpack 能处理 js/json，不能处理 css/img 等资源
```

### 基础配置文件

```js
// webpack.config.js - webpack 的配置文件
// 所有构建工具都是基于 Node.js 平台运行的，模块化默认采用 CommonJS
// 运行直接输入 webpack 即可打包

const { resolve } = require('path')
// resolve 用来拼接绝对路径的方法

module.exports = {
  // webpack 配置
  entry: './src/index.js', // 入口起点
  output: {
    // 输出
    filename: 'built.js', // 输出文件名
    path: resolve(__dirname, 'build'), // 输出路径
    // __dirname 是 Node.js 的变量，指当前文件的目录绝对路径
  },
  module: {
    // loader 的配置，解析 webpack 不能识别的文件，需要使用 loader
    rules: [
      {
        // 详细的 loader 配置
        test: /\\.css$/, // 匹配哪些文件，不同文件必须配置不同 loader 处理
        // use 数组中 loader 的执行顺序：从右到左，从下到上，依次执行
        use: [
          // 使用哪些 loader 进行处理
          'style-loader', // 创建 style 标签，将 js 中的样式资源插入，添加到 head 中生效
          'css-loader', // 将 css 文件转换为 CommonJS 模块加载到 js 中，里面是样式字符串
        ],
      },
      {
        test: /\\.less$/,
        use: [
          'style-loader',
          'css-loader',
          'less-loader', // 将 less 文件转换为 css 文件，需要下载 less-loader 和 less
        ],
      },
    ],
  },
  plugins: [
    // plugins 的配置
    // 详细的 plugins 配置
  ],
  // 模式
  mode: 'development', // 开发环境
  // mode: 'production' // 生产环境
}
```

---

## 打包各类资源

### 打包 HTML 资源

{/*
loader：下载 → 使用（配置 loader）
plugins：下载 → 引入 → 使用
*/}

```bash
npm i html-webpack-plugin -D
```

```js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'built.js',
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      // loader 的配置
    ],
  },
  plugins: [
    // plugins 的配置
    // html-webpack-plugin 功能：默认会创建一个空的 HTML 文件，自动引入打包输出的所有资源（JS/CSS）
    new HtmlWebpackPlugin({
      // 复制 './src/index.html' 文件，并自动引入打包输出的所有资源
      template: './src/index.html',
    }),
  ],
  mode: 'development',
}
```

### 打包图片资源

```js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'built.js',
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      // loader 的配置
      {
        test: /\\.less$/,
        use: ['style-loader', 'css-loader', 'less-loader'],
      },
      {
        // 默认处理不了 html 中的 img 图片，需要再加一个 html-loader 处理
        test: /\\.(jpg|png|gif)$/, // 处理图片资源
        loader: 'url-loader', // 使用一个 loader（使用多个用 use）
        // 需要下载 url-loader 和 file-loader
        // npm i url-loader file-loader -D
        options: {
          limit: 8 * 1024,
          // 图片大小小于 8kb，就会被 base64 处理
          // 优点：减少请求数量，减轻服务器压力
          // 缺点：图片体积会更大，文件请求速度会更慢

          // 问题：因为 url-loader 默认使用 ES6 模块化解析，而 html-loader 引入图片是 CommonJS
          // 解析时会出问题：[object Module]
          // 解决：关闭 url-loader 的 ES6 模块化，使用 CommonJS 解析
          esModule: false,
          name: '[hash:10].[ext]', // 给图片进行重命名
          // [hash:10] 取图片的 hash 的前 10 位
          // [ext] 取原来的扩展名
        },
      },
      {
        test: /\\.html$/,
        loader: 'html-loader', // 处理 html 文件的 img 图片（负责引入 img，从而能被 url-loader 进行处理）
        // 下载 html-loader
        // npm i html-loader -D
      },
    ],
  },
  plugins: [
    // plugins 的配置
    new HtmlWebpackPlugin({
      template: './src/index.html',
    }),
  ],
  mode: 'development',
}
```

### 打包其它资源

```js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'built.js',
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      // loader 的配置
      {
        test: /\\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        // 打包其他资源（除了 html/js/css 资源以外的资源）
        exclude: /\\.(css|js|html)$/, // 排除 css、js、html 资源
        loader: 'file-loader',
        // 需要安装 file-loader
        options: {
          name: '[hash:10].[ext]',
        },
      },
    ],
  },
  plugins: [
    // plugins 的配置
    new HtmlWebpackPlugin({
      // 处理 html 资源
      template: './src/index.html',
    }),
  ],
  mode: 'development',
}
```

---

## DevServer 开发服务器

{/*
开发服务器 devServer：用来自动化（自动编译，自动打开浏览器，自动刷新浏览器）
特点：只会在内存中编译打包，不会有任何输出
启动 devServer 指令为：npx webpack-dev-server
需要安装 webpack-dev-server：npm i webpack-dev-server -D
*/}

```bash
npm i webpack-dev-server -D
```

```js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'built.js',
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      // loader 的配置
    ],
  },
  plugins: [
    // plugins 的配置
    new HtmlWebpackPlugin({
      // 处理 html 资源
      template: './src/index.html',
    }),
  ],
  mode: 'development',
  devServer: {
    contentBase: resolve(__dirname, 'build'), // 项目构建后的路径
    compress: true, // 启动 gzip 压缩
    port: 3000, // 端口号
    open: true, // 自动打开默认浏览器
  },
}
```

---

## 开发环境基本配置

```js
// webpack.config.js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'js/built.js', // 输出到 build 下的 js 文件夹
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      // loader 的配置
      {
        test: /\\.less$/, // 处理 less 资源
        use: ['style-loader', 'css-loader', 'less-loader'],
      },
      {
        test: /\\.css$/, // 处理 css 资源
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\\.(jpg|png|gif)$/, // 处理图片资源
        loader: 'url-loader',
        options: {
          limit: 8 * 1024,
          name: '[hash:10].[ext]',
          esModule: false, // 关闭 ES6 模块化
          outputPath: 'imgs', // 输出路径，输出到 build 下的 imgs 文件夹
        },
      },
      {
        test: /\\.html$/, // 处理 html 中 img 资源
        loader: 'html-loader',
      },
      {
        exclude: /\\.(html|js|css|less|jpg|png|gif)$/, // 处理其它资源
        loader: 'file-loader',
        options: {
          name: '[hash:10].[ext]',
          outputPath: 'static', // 输出路径，输出到 build 下的 static 文件夹
        },
      },
    ],
  },
  plugins: {
    // plugins 的配置
    new HtmlWebpackPlugin({
      template: './src/index.html',
    }),
  },
  devServer: {
    contentBase: resolve(__dirname, 'build'),
    compress: true, // 启动 gzip 压缩
    port: 3000,
    open: true,
  },
  mode: 'development', // 不写默认为 production，建议写上
}
```

---

## 生产环境配置

### 提取 CSS 成单独文件

{/*
需要单独下载插件
npm i mini-css-extract-plugin -D
css 兼容性处理需要安装以下插件
npm i postcss-loader postcss-preset-env -D
*/}

```bash
npm i mini-css-extract-plugin -D
npm i postcss-loader postcss-preset-env -D
```

```js
// webpack.config.js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')

// 设置 Node.js 的环境变量
process.env.NODE_ENV = 'development'
// 跟 mode 的环境变量无关，不写默认为生产环境：'production'

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'js/built.js',
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      // loader 的配置
      {
        test: /\\.css$/, // 处理 css 资源
        use: [
          // 'style-loader', // 创建 style 标签，将样式放入
          MiniCssExtractPlugin.loader, // 这个 loader 取代 style-loader
          // 作用：提取 js 中的 css 成单独文件
          'css-loader', // 将 css 文件整合到 js 文件中
          /*
          CSS 兼容性处理：postcss */} postcss-loader postcss-preset-env
          帮 postcss 找到 package.json 中 browserslist 里面的配置，通过配置加载指定的 css 兼容性样式
          
          "browserslist": {
            "development": [
              "last 1 chrome version",
              "last 1 firefox version",
              "last 1 safari version"
            ],
            "production": [
              ">0.2%",
              "not dead",
              "not op_mini all"
            ]
          }
          */
          // 使用 loader 的默认配置
          // 'postcss-loader',
          // 修改 loader 的配置
          {
            loader: 'postcss-loader', // 兼容性处理
            options: {
              ident: 'postcss',
              plugins: () => [
                require('postcss-preset-env')(), // postcss 插件
              ],
            },
          },
        ],
      },
    ],
  },
  plugins: {
    // plugins 的配置
    new HtmlWebpackPlugin({
      template: './src/index.html',
    }),
    new MiniCssExtractPlugin({
      filename: 'css/built.css', // 对输出的 css 文件进行重命名
    }),
  },
  mode: 'development',
}
```

### 压缩 CSS

{/*
需要下载插件
npm i optimize-css-assets-webpack-plugin -D
*/}

```bash
npm i optimize-css-assets-webpack-plugin -D
```

```js
// webpack.config.js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const OptimizeCssAssetsWebpackPlugin = require('optimize-css-assets-webpack-plugin')

// 设置 Node.js 的环境变量
process.env.NODE_ENV = 'development'

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'js/built.js',
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      // loader 的配置
      {
        test: /\\.css$/, // 处理 css 资源
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader', // 将 css 文件整合到 js 文件中
          {
            // 修改 loader 的配置
            loader: 'postcss-loader', // 兼容性处理
            options: {
              ident: 'postcss',
              plugins: () => {
                require('postcss-preset-env') // postcss 插件
              },
            },
          },
        ],
      },
    ],
  },
  plugins: {
    // plugins 的配置
    new HtmlWebpackPlugin({
      template: './src/index.html',
    }),
    new MiniCssExtractPlugin({
      filename: 'css/built.css',
    }),
    new OptimizeCssAssetsWebpackPlugin(), // 压缩 css
  },
  mode: 'development',
}
```

### JS 语法检查（ESLint）

{/*
需要安装如下插件
npm i eslint-config-airbnb-base eslint eslint-loader eslint-plugin-import -D
*/}

```bash
npm i eslint-config-airbnb-base eslint eslint-loader eslint-plugin-import -D
```

```js
// webpack.config.js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'js/built.js',
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      // loader 的配置
      /*
      语法检查：eslint-loader eslint
      注意：只检查自己写的源代码，第三方库不检查
      设置检查规则：
        package.json 中 eslintConfig 中设置
          "eslintConfig": {
            "extends": "airbnb-base"
          }
        airbnb */} eslint-config-airbnb-base eslint eslint-plugin-import
      */
      {
        test: /\\.js$/,
        exclude: /node_modules/,
        loader: 'eslint-loader',
        options: {
          fix: true, // 自动修复 eslint 的错误
        },
      },
    ],
  },
  plugins: {
    // plugins 的配置
    new HtmlWebpackPlugin({
      template: './src/index.html',
    }),
  },
  mode: 'development',
}
```

### JS 兼容性处理

{/*
需要安装如下插件
npm i babel-loader @babel/preset-env @babel/core -D

需要兼容全部 js 需要安装以下插件，然后在入口文件引入即可
比如 ./src/index.js (import '@babel/polyfill')
npm i @babel/polyfill -D
体积太大，建议使用按需加载

按需加载需要做兼容性的 js，需要安装如下插件（如使用了这种方案，需要把上面方案的入口文件引入注释掉）
npm i core-js -D
*/}

```bash
# 基础 babel
npm i babel-loader @babel/preset-env @babel/core -D

# 全部 polyfill（体积大）
npm i @babel/polyfill -D

# 按需加载（推荐）
npm i core-js -D
```

```js
// webpack.config.js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'js/built.js',
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      // loader 的配置
      /*
      JS 兼容性处理：babel-loader @babel/core @babel/preset-env
      1. 基本兼容性处理 */} @babel/preset-env
         问题：只能转换基本语法，如 Promise 高级语法不能转换
      2. 全部 JS 兼容性处理 */} @babel/polyfill
         问题：只要解决部分兼容性问题，但是将所有的兼容性代码引入，体积太大了
      3. 需要做兼容性处理的就做：按需加载 */} core-js（如果使用第三种方案就不能使用第二种方案）
      */
      {
        test: /\\.js$/,
        exclude: /node_modules/,
        loader: 'babel-loader',
        options: {
          // 预设：指示 babel 做怎样的兼容性处理
          presets: [
            [
              '@babel/preset-env',
              {
                useBuiltIns: 'usage', // 按需加载
                corejs: {
                  // 指定 core-js 版本
                  version: 3,
                },
                targets: {
                  // 指定兼容性做到哪个版本浏览器
                  chrome: '60',
                  firefox: '60',
                  ie: '9',
                  safari: '10',
                  edge: '17',
                },
              },
            ],
          ],
        },
      },
    ],
  },
  plugins: {
    // plugins 的配置
    new HtmlWebpackPlugin({
      template: './src/index.html',
    }),
  },
  mode: 'development',
}
```

### 压缩 JS

```js
// webpack.config.js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'js/built.js',
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      // loader 的配置
    ],
  },
  plugins: {
    // plugins 的配置
    new HtmlWebpackPlugin({
      template: './src/index.html',
    }),
  },
  // 生产环境下会自动压缩 js 代码
  // mode: 'development'
  mode: 'production',
}
```

### 压缩 HTML

```js
// webpack.config.js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: './src/index.js',
  output: {
    filename: 'js/built.js',
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      // loader 的配置
    ],
  },
  plugins: {
    // plugins 的配置
    new HtmlWebpackPlugin({
      template: './src/index.html',
      minify: {
        // 压缩 html 代码
        collapseWhitespace: true, // 移除空格
        removeComments: true, // 移除注释
      },
    }),
  },
  // 生产环境下会自动压缩 js 代码
  mode: 'production',
}
```

### 生产环境基本配置

```js
// webpack.config.js
const { resolve } = require('path')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const OptimizeCssAssetsWebpackPlugin = require('optimize-css-assets-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')

// 定义 Node.js 环境变量：决定使用 browserslist 的哪个环境
process.env.NODE_ENV = 'production'

// 复用 loader
const commonCssLoader = [
  MiniCssExtractPlugin.loader,
  'css-loader',
  {
    // 还需要在 package.json 中定义 browserslist
    loader: 'postcss-loader',
    options: {
      ident: 'postcss',
      plugins: () => [require('postcss-preset-env')()],
    },
  },
]

module.exports = {
  entry: './src/js/index.js',
  output: {
    filename: 'js/built.js',
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      // loader 的配置
      {
        test: /\\.css$/,
        use: [...commonCssLoader],
      },
      /*
      正常来讲，一个文件只能被一个 loader 处理
      当一个文件要被多个 loader 处理，那么一定要指定 loader 执行的先后顺序：
      先执行 eslint，再执行 babel
      */
      {
        test: /\\.less$/,
        use: [...commonCssLoader, 'less-loader'],
      },
      {
        // 需要在 package.json 配置 eslintConfig */} airbnb
        test: /\\.js$/, // 格式校验
        exclude: /node_modules/,
        enforce: 'pre', // 优先执行
        loader: 'eslint-loader',
        options: {
          fix: true, // 自动修复 eslint 的错误
        },
      },
      {
        test: /\\.js$/, // JS 兼容处理
        exclude: /node_modules/,
        loader: 'babel-loader',
        options: {
          presets: [
            [
              '@babel/preset-env',
              {
                useBuiltIns: 'usage',
                corejs: { version: 3 },
                targets: {
                  chrome: '60',
                  firefox: '60',
                  ie: '9',
                  safari: '10',
                  edge: '17',
                },
              },
            ],
          ],
        },
      },
      {
        test: /\\.(jpg|png|gif)$/,
        loader: 'url-loader',
        options: {
          limit: 8 * 1024,
          name: '[hash:10].[ext]',
          outputPath: 'imgs',
          esModule: false, // 关闭 ES6 模块化解析
        },
      },
      {
        test: /\\.html$/,
        loader: 'html-loader',
      },
      {
        exclude: /\\.(js|css|less|html|jpg|png|gif)/,
        loader: 'file-loader',
        options: {
          outputPath: 'media', // 输出到 media 文件夹
        },
      },
    ],
  },
  plugins: {
    // plugins 的配置
    new MiniCssExtractPlugin({
      filename: 'css/built.css',
    }),
    new OptimizeCssAssetsWebpackPlugin(),
    new HtmlWebpackPlugin({
      template: './src/index.html',
      minify: {
        collapseWhitespace: true,
        removeComments: true,
      },
    }),
  },
  // 生产环境下会自动压缩 js 代码
  mode: 'production',
}
```

---

## Webpack 优化

### HMR（热模块替换）

```js
// webpack.config.js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: ['./src/index.js', './src/index.html'],
  output: {
    filename: 'js/built.js',
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      // loader 的配置
      {
        test: /\\.less$/, // 处理 less 资源
        use: ['style-loader', 'css-loader', 'less-loader'],
      },
      {
        test: /\\.css$/, // 处理 css 资源
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\\.(jpg|png|gif)$/, // 处理图片资源
        loader: 'url-loader',
        options: {
          limit: 8 * 1024,
          name: '[hash:10].[ext]',
          esModule: false,
          outputPath: 'imgs',
        },
      },
      {
        test: /\\.html$/, // 处理 html 中 img 资源
        loader: 'html-loader',
      },
      {
        exclude: /\\.(html|js|css|less|jpg|png|gif)$/, // 处理其它资源
        loader: 'file-loader',
        options: {
          name: '[hash:10].[ext]',
          outputPath: 'static',
        },
      },
    ],
  },
  plugins: {
    // plugins 的配置
    new HtmlWebpackPlugin({
      template: './src/index.html',
    }),
  },
  devServer: {
    contentBase: resolve(__dirname, 'build'),
    compress: true,
    port: 3000,
    open: true,
    hot: true, // 开启 HMR 功能
  },
  mode: 'development',
}

/*
HMR: hot module replacement 热模块替换/模块热替换
作用：一个模块发生变化，只会重新打包这一个模块（而不是打包所有模块），极大提升构建速度

  样式文件：可以使用 HMR 功能，因为 style-loader 内部实现了
  JS 文件：默认不能使用 HMR 功能 */} 需要修改 JS 代码，添加支持 HMR 功能的代码
    注意：HMR 功能对 JS 的处理，只能处理非入口 JS 文件的其他文件
  HTML 文件：默认不能使用 HMR 功能，同时会导致问题，HTML 文件不能热更新了
    解决：修改 entry 入口，将 html 文件引入
*/
```

### Source Map

```js
// webpack.config.js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: ['./src/index.js', './src/index.html'],
  output: {
    filename: 'js/built.js',
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      // loader 的配置
    ],
  },
  plugins: {
    // plugins 的配置
    new HtmlWebpackPlugin({
      template: './src/index.html',
    }),
  },
  devServer: {
    contentBase: resolve(__dirname, 'build'),
    compress: true,
    port: 3000,
    open: true,
    hot: true,
  },
  mode: 'development',
  devtool: 'source-map',
}

/*
Source Map：一种提供源代码到构建后代码映射技术
（如果构建后代码出错了，通过映射可以追踪源代码错误）

格式：[inline-|hidden-|eval-][nosources-][cheap-[module-]]source-map

  source-map              外部
    提供错误代码的准确信息和源代码的错误位置
  inline-source-map       内联（只生成一个内联 source-map）
    提供错误代码的准确信息和源代码的错误位置
  hidden-source-map       外部
    提供错误代码的错误原因，但没有错误位置，不能追踪到源代码错误
  eval-source-map         内联（每一个文件都生成对应的 source-map，都在 eval）
    提供错误代码的准确信息和源代码的错误位置
  nosources-source-map    外部
    提供错误代码的准确信息，但是没有任何源代码信息
  cheap-source-map        外部
    提供错误代码的准确信息和源代码的错误位置，只能精确到行
  cheap-module-source-map 外部
    提供错误代码的准确信息和源代码的错误位置
    module 会将 loader 的 source map 加入

开发环境：速度快，调试更友好
  速度快（eval > inline > cheap > ...）
    eval-cheap-source-map
    eval-source-map
  调试更友好
    source-map
    cheap-module-source-map
    cheap-source-map
  */} eval-source-map / eval-cheap-module-source-map

生产环境：源代码要不要隐藏？调试要不要更友好
  （内联会让代码体积变大，所以在生产环境不用内联）
  nosources-source-map    全部隐藏
  hidden-source-map       只隐藏源代码
  */} source-map / cheap-module-source-map
*/
```

### OneOf

```js
// webpack.config.js
const { resolve } = require('path')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const OptimizeCssAssetsWebpackPlugin = require('optimize-css-assets-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')

process.env.NODE_ENV = 'production'

const commonCssLoader = [
  MiniCssExtractPlugin.loader,
  'css-loader',
  {
    loader: 'postcss-loader',
    options: {
      ident: 'postcss',
      plugins: () => [require('postcss-preset-env')()],
    },
  },
]

module.exports = {
  entry: './src/js/index.js',
  output: {
    filename: 'js/built.js',
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      // loader 的配置
      {
        test: /\\.js$/,
        exclude: /node_modules/,
        enforce: 'pre',
        loader: 'eslint-loader',
        options: {
          fix: true,
        },
      },
      {
        oneOf: [
          // 以下 loader 只会匹配一个（不能有两个配置处理同一类型文件）
          {
            test: /\\.css$/,
            use: [...commonCssLoader],
          },
          {
            test: /\\.less$/,
            use: [...commonCssLoader, 'less-loader'],
          },
          {
            test: /\\.js$/,
            exclude: /node_modules/,
            loader: 'babel-loader',
            options: {
              presets: [
                [
                  '@babel/preset-env',
                  {
                    useBuiltIns: 'usage',
                    corejs: { version: 3 },
                    targets: {
                      chrome: '60',
                      firefox: '60',
                      ie: '9',
                      safari: '10',
                      edge: '17',
                    },
                  },
                ],
              ],
            },
          },
          {
            test: /\\.(jpg|png|gif)$/,
            loader: 'url-loader',
            options: {
              limit: 8 * 1024,
              name: '[hash:10].[ext]',
              outputPath: 'imgs',
              esModule: false,
            },
          },
          {
            test: /\\.html$/,
            loader: 'html-loader',
          },
          {
            exclude: /\\.(js|css|less|html|jpg|png|gif)/,
            loader: 'file-loader',
            options: {
              outputPath: 'media',
            },
          },
        ],
      },
    ],
  },
  plugins: {
    // plugins 的配置
    new MiniCssExtractPlugin({
      filename: 'css/built.css',
    }),
    new OptimizeCssAssetsWebpackPlugin(),
    new HtmlWebpackPlugin({
      template: './src/index.html',
      minify: {
        collapseWhitespace: true,
        removeComments: true,
      },
    }),
  },
  mode: 'production',
}
```

### 缓存

```js
// webpack.config.js
/*
缓存：
  babel 缓存：cacheDirectory: true
    第二次构建时，会读取之前的缓存
  
  文件资源缓存：
    hash：每次 webpack 构建时会生成一个唯一的 hash 值
      问题：因为 js 和 css 同时使用一个 hash 值，如果重新打包，会导致所有缓存失败
    chunkhash：根据 chunk 生成的 hash 值，如果打包来源于同一个 chunk，那么 hash 值就一样
      问题：js 和 css 的 hash 值还是一样，因为 css 是在 js 中被引入的，所以同属一个 chunk
    contenthash：根据文件的内容生成 hash 值，不同文件 hash 值一定不会相同
    */} 让代码上线运行缓存更好的使用
*/

const { resolve } = require('path')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const OptimizeCssAssetsWebpackPlugin = require('optimize-css-assets-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')

process.env.NODE_ENV = 'production'

const commonCssLoader = [
  MiniCssExtractPlugin.loader,
  'css-loader',
  {
    loader: 'postcss-loader',
    options: {
      ident: 'postcss',
      plugins: () => [require('postcss-preset-env')()],
    },
  },
]

module.exports = {
  entry: './src/js/index.js',
  output: {
    filename: 'js/built.[contenthash:10].js',
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      {
        test: /\\.js$/,
        exclude: /node_modules/,
        enforce: 'pre',
        loader: 'eslint-loader',
        options: {
          fix: true,
        },
      },
      {
        oneOf: [
          {
            test: /\\.css$/,
            use: [...commonCssLoader],
          },
          {
            test: /\\.less$/,
            use: [...commonCssLoader, 'less-loader'],
          },
          {
            test: /\\.js$/,
            exclude: /node_modules/,
            loader: 'babel-loader',
            options: {
              presets: [
                [
                  '@babel/preset-env',
                  {
                    useBuiltIns: 'usage',
                    corejs: { version: 3 },
                    targets: {
                      chrome: '60',
                      firefox: '60',
                      ie: '9',
                      safari: '10',
                      edge: '17',
                    },
                  },
                ],
              ],
              cacheDirectory: true, // 开启 babel 缓存
            },
          },
          {
            test: /\\.(jpg|png|gif)$/,
            loader: 'url-loader',
            options: {
              limit: 8 * 1024,
              name: '[hash:10].[ext]',
              outputPath: 'imgs',
              esModule: false,
            },
          },
          {
            test: /\\.html$/,
            loader: 'html-loader',
          },
          {
            exclude: /\\.(js|css|less|html|jpg|png|gif)/,
            loader: 'file-loader',
            options: {
              outputPath: 'media',
            },
          },
        ],
      },
    ],
  },
  plugins: {
    new MiniCssExtractPlugin({
      filename: 'css/built.[contenthash:10].css',
    }),
    new OptimizeCssAssetsWebpackPlugin(),
    new HtmlWebpackPlugin({
      template: './src/index.html',
      minify: {
        collapseWhitespace: true,
        removeComments: true,
      },
    }),
  },
  mode: 'production',
  devtool: 'source-map',
}
```

### Tree Shaking

```js
// webpack.config.js
/*
Tree Shaking：去除无用代码
  前提：
    1. 必须使用 ES6 模块化
    2. 开启 production 环境
  作用：减少代码体积

  在 package.json 中配置：
    "sideEffects": false 所有代码都没有副作用（都可以进行 tree shaking）
      问题：可能会把 css/@babel/polyfill（副作用）文件干掉
    "sideEffects": ["*.css", "*.less"]
*/

const { resolve } = require('path')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const OptimizeCssAssetsWebpackPlugin = require('optimize-css-assets-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')

process.env.NODE_ENV = 'production'

const commonCssLoader = [
  MiniCssExtractPlugin.loader,
  'css-loader',
  {
    loader: 'postcss-loader',
    options: {
      ident: 'postcss',
      plugins: () => [require('postcss-preset-env')()],
    },
  },
]

module.exports = {
  entry: './src/js/index.js',
  output: {
    filename: 'js/built.[contenthash:10].js',
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      {
        test: /\\.js$/,
        exclude: /node_modules/,
        enforce: 'pre',
        loader: 'eslint-loader',
        options: {
          fix: true,
        },
      },
      {
        oneOf: [
          {
            test: /\\.css$/,
            use: [...commonCssLoader],
          },
          {
            test: /\\.less$/,
            use: [...commonCssLoader, 'less-loader'],
          },
          {
            test: /\\.js$/,
            exclude: /node_modules/,
            loader: 'babel-loader',
            options: {
              presets: [
                [
                  '@babel/preset-env',
                  {
                    useBuiltIns: 'usage',
                    corejs: { version: 3 },
                    targets: {
                      chrome: '60',
                      firefox: '60',
                      ie: '9',
                      safari: '10',
                      edge: '17',
                    },
                  },
                ],
              ],
              cacheDirectory: true,
            },
          },
          {
            test: /\\.(jpg|png|gif)$/,
            loader: 'url-loader',
            options: {
              limit: 8 * 1024,
              name: '[hash:10].[ext]',
              outputPath: 'imgs',
              esModule: false,
            },
          },
          {
            test: /\\.html$/,
            loader: 'html-loader',
          },
          {
            exclude: /\\.(js|css|less|html|jpg|png|gif)/,
            loader: 'file-loader',
            options: {
              outputPath: 'media',
            },
          },
        ],
      },
    ],
  },
  plugins: {
    new MiniCssExtractPlugin({
      filename: 'css/built.[contenthash:10].css',
    }),
    new OptimizeCssAssetsWebpackPlugin(),
    new HtmlWebpackPlugin({
      template: './src/index.html',
      minify: {
        collapseWhitespace: true,
        removeComments: true,
      },
    }),
  },
  mode: 'production',
  devtool: 'source-map',
}
```

### Code Splitting（代码分割）

```js
// webpack.config.js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: './src/js/index.js', // 单入口
  /*
  entry: {
    // 多入口：有一个入口，最终输出就有一个 bundle
    main: './src/js/index.js',
    test: './src/js/test.js'
  },
  */
  output: {
    // [name]: 取文件名，文件名为 entry 里定义的名字
    filename: 'js/[name].[contenthash:10].js',
    path: resolve(__dirname, 'build'),
  },
  plugins: {
    new HtmlWebpackPlugin({
      template: './src/index.html',
      minify: {
        collapseWhitespace: true,
        removeComments: true,
      },
    }),
  },
  /*
  1. 单入口可以将 node_modules 中代码单独打包一个 chunk 最终输出
  2. 自动分析多入口 chunk 中，有没有公共的文件，如果有，会打包成单独的一个 chunk
  */
  optimization: {
    splitChunks: {
      chunks: 'all',
    },
  },
  mode: 'production',
}
```

### 懒加载 / 预加载

{/* 懒加载和预加载的概念说明 */}

### PWA（渐进式 Web 应用）

{/*
需要下载插件
npm i workbox-webpack-plugin -D
*/}

```bash
npm i workbox-webpack-plugin -D
```

```js
// webpack.config.js
const { resolve } = require('path')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const OptimizeCssAssetsWebpackPlugin = require('optimize-css-assets-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const WorkboxWebpackPlugin = require('workbox-webpack-plugin')

/*
PWA：渐进式网络开发应用程序（离线可访问）
  workbox */} workbox-webpack-plugin
*/

process.env.NODE_ENV = 'production'

const commonCssLoader = [
  MiniCssExtractPlugin.loader,
  'css-loader',
  {
    loader: 'postcss-loader',
    options: {
      ident: 'postcss',
      plugins: () => [require('postcss-preset-env')()],
    },
  },
]

module.exports = {
  entry: './src/js/index.js',
  output: {
    filename: 'js/built.[contenthash:10].js',
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      {
        test: /\\.js$/,
        exclude: /node_modules/,
        enforce: 'pre',
        loader: 'eslint-loader',
        options: {
          fix: true,
        },
      },
      {
        oneOf: [
          {
            test: /\\.css$/,
            use: [...commonCssLoader],
          },
          {
            test: /\\.less$/,
            use: [...commonCssLoader, 'less-loader'],
          },
          {
            test: /\\.js$/,
            exclude: /node_modules/,
            loader: 'babel-loader',
            options: {
              presets: [
                [
                  '@babel/preset-env',
                  {
                    useBuiltIns: 'usage',
                    corejs: { version: 3 },
                    targets: {
                      chrome: '60',
                      firefox: '60',
                      ie: '9',
                      safari: '10',
                      edge: '17',
                    },
                  },
                ],
              ],
              cacheDirectory: true,
            },
          },
          {
            test: /\\.(jpg|png|gif)$/,
            loader: 'url-loader',
            options: {
              limit: 8 * 1024,
              name: '[hash:10].[ext]',
              outputPath: 'imgs',
              esModule: false,
            },
          },
          {
            test: /\\.html$/,
            loader: 'html-loader',
          },
          {
            exclude: /\\.(js|css|less|html|jpg|png|gif)/,
            loader: 'file-loader',
            options: {
              outputPath: 'media',
            },
          },
        ],
      },
    ],
  },
  plugins: {
    new MiniCssExtractPlugin({
      filename: 'css/built.[contenthash:10].css',
    }),
    new OptimizeCssAssetsWebpackPlugin(),
    new HtmlWebpackPlugin({
      template: './src/index.html',
      minify: {
        collapseWhitespace: true,
        removeComments: true,
      },
    }),
    /*
    1. 帮助 service worker 快速启动
    2. 删除旧的 service worker
    生成一个 service worker 配置文件
    */
    new WorkboxWebpackPlugin.GenerateSW({
      clientsClaim: true,
      skipWaiting: true,
    }),
  },
  mode: 'production',
  devtool: 'source-map',
}
```

```js
/*
1. eslint 不认识 window、navigator 全局变量
   解决：需要修改 package.json 中 eslintConfig 配置
   "env": {
     "browser": true  // 支持浏览器全局变量
   }
2. SW 代码必须运行在服务器上
   */} Node.js
   */} npm i serve -g
       serve -s build 启动服务器，将 build 目录下所有资源作为静态资源暴露出去
*/

// 在入口文件中（如：main.js）注册 service worker
// 处理兼容性问题
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/service-worker.js')
      .then(() => {
        console.log('SW 注册成功了')
      })
      .catch(() => {
        console.log('SW 注册失败了')
      })
  })
}
```

### 多进程打包

{/*
安装以下插件
npm i thread-loader -D
*/}

```bash
npm i thread-loader -D
```

```js
// webpack.config.js
const { resolve } = require('path')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const OptimizeCssAssetsWebpackPlugin = require('optimize-css-assets-webpack-plugin')
const HtmlWebpackPlugin = require('html-webpack-plugin')

process.env.NODE_ENV = 'production'

const commonCssLoader = [
  MiniCssExtractPlugin.loader,
  'css-loader',
  {
    loader: 'postcss-loader',
    options: {
      ident: 'postcss',
      plugins: () => [require('postcss-preset-env')()],
    },
  },
]

module.exports = {
  entry: './src/js/index.js',
  output: {
    filename: 'js/built.[contenthash:10].js',
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      {
        test: /\\.js$/,
        exclude: /node_modules/,
        enforce: 'pre',
        loader: 'eslint-loader',
        options: {
          fix: true,
        },
      },
      {
        oneOf: [
          {
            test: /\\.css$/,
            use: [...commonCssLoader],
          },
          {
            test: /\\.less$/,
            use: [...commonCssLoader, 'less-loader'],
          },
          {
            test: /\\.js$/,
            exclude: /node_modules/,
            use: [
              {
                loader: 'thread-loader', // 开启多进程打包
                options: {
                  workers: 2, // 进程 2 个
                },
                /*
                进程启动大概为 600ms，进程通信也有开销
                只有工作消耗时间比较长，才需要多进程打包
                */
              },
              {
                loader: 'babel-loader',
                options: {
                  presets: [
                    [
                      '@babel/preset-env',
                      {
                        useBuiltIns: 'usage',
                        corejs: { version: 3 },
                        targets: {
                          chrome: '60',
                          firefox: '60',
                          ie: '9',
                          safari: '10',
                          edge: '17',
                        },
                      },
                    ],
                  ],
                  cacheDirectory: true,
                },
              },
            ],
          },
          {
            test: /\\.(jpg|png|gif)$/,
            loader: 'url-loader',
            options: {
              limit: 8 * 1024,
              name: '[hash:10].[ext]',
              outputPath: 'imgs',
              esModule: false,
            },
          },
          {
            test: /\\.html$/,
            loader: 'html-loader',
          },
          {
            exclude: /\\.(js|css|less|html|jpg|png|gif)/,
            loader: 'file-loader',
            options: {
              outputPath: 'media',
            },
          },
        ],
      },
    ],
  },
  plugins: {
    new MiniCssExtractPlugin({
      filename: 'css/built.[contenthash:10].css',
    }),
    new OptimizeCssAssetsWebpackPlugin(),
    new HtmlWebpackPlugin({
      template: './src/index.html',
      minify: {
        collapseWhitespace: true,
        removeComments: true,
      },
    }),
  },
  mode: 'production',
  devtool: 'source-map',
}
```

### Externals

```js
// webpack.config.js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: './src/js/index.js',
  output: {
    filename: 'js/built.js',
    path: resolve(__dirname, 'build'),
  },
  module: {
    rules: [
      // loader 的配置
    ],
  },
  plugins: {
    // plugins 的配置
    new HtmlWebpackPlugin({
      template: './src/index.html',
      minify: {
        collapseWhitespace: true,
        removeComments: true,
      },
    }),
  },
  mode: 'production',
  externals: {
    jquery: 'jQuery', // 忽略库名 --- npm 包名（拒绝 jQuery 被打包，自己手动通过 CDN 引入）
  },
}
```

### DLL（动态链接库）

{/*
需要安装以下插件
npm i add-asset-html-webpack-plugin -D
*/}

```bash
npm i add-asset-html-webpack-plugin -D
```

```js
// webpack.dll.js
/*
使用 DLL 技术，对某些库（第三方库：jQuery、React、Vue...）进行单独打包
  当你运行 webpack 时，默认查找 webpack.config.js 配置文件
  需求：需要运行 webpack.dll.js 文件
    */} webpack --config webpack.dll.js
*/
const { resolve } = require('path')
const webpack = require('webpack')

module.exports = {
  entry: {
    // 最终打包生成的 [name] */} jquery
    // ['jquery'] */} 要打包的库是 jquery
    jquery: ['jquery'],
  },
  output: {
    filename: '[name].js',
    path: resolve(__dirname, 'dll'),
    library: '[name]_[hash]', // 打包的库里面向外暴露出去的内容叫什么名字
  },
  plugins: [
    // 打包生成一个 manifest.json */} 提供和 jquery 映射
    new webpack.DllPlugin({
      name: '[name]_[hash]', // 映射库的暴露的内容名称
      path: resolve(__dirname, 'dll/manifest.json'), // 输出文件路径
    }),
  ],
  mode: 'production',
}
```

```js
// webpack.config.js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const webpack = require('webpack')
const AddAssetHtmlWebpackPlugin = require('add-asset-html-webpack-plugin')

module.exports = {
  entry: './src/js/index.js',
  output: {
    filename: 'js/built.js',
    path: resolve(__dirname, 'build'),
  },
  plugins: {
    // plugins 的配置
    new HtmlWebpackPlugin({
      template: './src/index.html',
    }),
    new webpack.DllReferencePlugin({
      // 告诉 webpack 哪些库不需要打包，同时使用时名称也得变
      manifest: resolve(__dirname, 'dll/manifest.json'),
    }),
    new AddAssetHtmlWebpackPlugin({
      // 将某个文件打包输出出去，并在 html 中自动引入该资源
      filepath: resolve(__dirname, 'dll/jquery.js'),
    }),
  },
  mode: 'production',
}
```

**总结：**
- 如果通过 CDN 方式，推荐使用 `externals`（彻底不打包，需要 CDN 方式连接）
- 如果是想要第三方库都打包整合到一起，不使用 CDN 连接，而是自己服务器向外暴露出去，推荐使用 `dll`（需要打包，只打包一次，后面不需要重复打包）

---

## 优化总结

### 开发环境性能优化

- **优化打包速度**
  - `HMR`
- **优化代码调试**
  - `source-map`

### 生产环境性能优化

- **优化打包构建速度**
  - `oneOf`
  - `babel` 缓存
  - 多进程打包
  - `externals`（哪些库不用打包，CDN 连接）
  - `dll`（多个库合并成一个库）
- **优化代码运行的性能**
  - 缓存（`hash` → `chunkhash` → `contenthash`）
  - `tree shaking`
  - `code split`
  - 懒加载 / 预加载
  - `PWA`（兼容性不太好）

---

## 配置详解

### Entry（入口）

```js
// webpack.config.js
/*
entry：入口起点
  1. string */} './src/index.js'（用的较多）
     单入口
       打包形成一个 chunk，输出一个 bundle 文件。此时 chunk 的名称默认是 main
  2. array（不常用）
     多入口
       所有文件最终只会形成一个 chunk，输出只有一个 bundle 文件
       */} 只有在 HMR 功能中让 html 热更新生效
  3. object
     多入口
       有几个入口文件就形成几个 chunk，输出几个 bundle 文件
       此时 chunk 的名称就是 key

  */} 特殊用法
    {
      // 所有文件最终只会形成一个 chunk，输出只有一个 bundle 文件
      index: ['./src/index.js', './src/count.js'],
      // 形成一个 chunk，输出一个 bundle 文件
      add: './src/add.js'
    }
*/

const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  // entry: './src/index.js',
  // entry: ['./src/index.js', './src/add.js'],
  /*
  entry: {
    index: './src/index.js',
    add: './src/add.js'
  },
  */
  entry: {
    index: ['./src/index.js', './src/count.js'],
    add: './src/add.js',
  },
  output: {
    filename: '[name].js',
    path: resolve(__dirname, 'build'),
  },
  plugins: [new HtmlWebpackPlugin()],
  mode: 'development',
}
```

### Output（出口）

```js
// webpack.config.js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: './src/index.js',
  output: {
    // 文件名称（指定名称 + 目录）
    filename: 'js/[name].js',
    // 输出文件目录（将来所有资源输出的公共目录）
    path: resolve(__dirname, 'build'),
    // 所有输出资源的引入公共路径前缀 */} 'imgs/a.jpg' */} '/imgs/a.jpg'
    publicPath: '/', // 一般应用于生产环境
    chunkFilename: '[name]_chunk.js', // 非入口 chunk 的名称
    library: '[name]', // 整个库向外暴露的变量名
    // libraryTarget: 'window' // 变量名添加到哪个上 browser（浏览器端）
    // libraryTarget: 'global' // 变量名添加到哪个上 node
    // libraryTarget: 'commonjs'
  },
  plugins: [new HtmlWebpackPlugin()],
  mode: 'development',
}
```

### Module

```js
// webpack.config.js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: './src/index.js',
  module: {
    rules: [
      // loader 的配置
      {
        test: /\\.css$/,
        use: ['style-loader', 'css-loader'], // 多个 loader 使用 use
      },
      {
        test: /\\.js$/,
        exclude: /node_modules/, // 排除 node_modules 下的 js 文件
        include: resolve(__dirname, 'src'), // 只检查 src 下的 js 文件
        // enforce: 'pre', // 优先执行
        enforce: 'post', // 延后执行
        loader: 'eslint-loader', // 单个 loader 使用 loader
        options: {},
      },
      {
        // 以下配置只会生效一个
        oneOf: [],
      },
    ],
  },
  output: {
    filename: 'js/[name].js',
    path: resolve(__dirname, 'build'),
  },
  plugins: [new HtmlWebpackPlugin()],
  mode: 'development',
}
```

### Resolve

```js
// webpack.config.js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: './src/index.js',
  module: {
    rules: [
      // loader 的配置
      {
        test: /\\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  output: {
    filename: 'js/[name].js',
    path: resolve(__dirname, 'build'),
  },
  plugins: [new HtmlWebpackPlugin()],
  mode: 'development',
  resolve: {
    // 解析模块的规则
    alias: {
      // 配置解析模块路径别名：优点：简写路径 缺点：路径没有提示
      $css: resolve(__dirname, 'src/css'),
    },
    // 配置省略文件路径的后缀名
    extensions: ['.js', '.json', '.jsx', '.css'],
    // 告诉 webpack 解析模块去找哪个目录
    modules: [resolve(__dirname, './node_modules'), 'node_modules'],
  },
}
```

### DevServer

```js
// webpack.config.js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
  entry: './src/index.js',
  module: {
    rules: [
      // loader 的配置
      {
        test: /\\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  output: {
    filename: 'js/[name].js',
    path: resolve(__dirname, 'build'),
  },
  plugins: [new HtmlWebpackPlugin()],
  mode: 'development',
  devServer: {
    // 运行代码的目录
    contentBase: resolve(__dirname, 'build'),
    watchContentBase: true, // 监视 contentBase 目录下所有文件，一旦变化就会 reload（重新刷新）
    watchOptions: {
      ignored: /node_modules/, // 忽略文件
    },
    compress: true, // 启动 gzip 压缩
    port: 5000, // 端口号
    host: 'localhost', // 域名
    open: true, // 自动打开浏览器
    hot: true, // 开启 HMR 功能
    clientLogLevel: 'none', // 不显示启动服务器日志信息
    quiet: true, // 除了一些基本启动信息以外，其他内容都不显示
    overlay: false, // 如果出错，不要全屏提示
    // 服务器代理 */} 解决开发环境跨域问题
    proxy: {
      // 一旦 devServer（5000）服务器接收到 /api/xxx 的请求，就会把请求转发到另一个服务器（3000）
      '/api': {
        target: 'http://localhost:3000',
        // 发送请求时，请求路径重写
        pathRewrite: {
          '^/api': '',
        },
      },
    },
  },
}
```

### Optimization

```js
// webpack.config.js
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const TerserWebpackPlugin = require('terser-webpack-plugin')

module.exports = {
  entry: './src/index.js',
  module: {
    rules: [
      // loader 的配置
      {
        test: /\\.css$/,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  output: {
    filename: 'js/[name].[contenthash:10].js',
    path: resolve(__dirname, 'build'),
    chunkFilename: 'js/[name].[contenthash:10]_chunk.js',
  },
  plugins: [new HtmlWebpackPlugin()],
  mode: 'production',
  optimization: {
    splitChunks: {
      chunks: 'all',
      // 默认值，可以不写
      /*
      minSize: 30 * 1024, // 分割的 chunk 最小为 30kb
      maxSize: 0, // 没有最大限制
      minChunks: 1, // 要提取的 chunk 最少被引用 1 次
      maxAsyncRequests: 5, // 按需加载时并行加载文件的最大数量
      maxInitialRequests: 3, // 入口 js 文件最大并行请求数量
      automaticNameDelimiter: '~', // 名称连接符
      name: true, // 可以使用命名规则
      // 分割 chunk 的组
      cacheGroups: {
        // node_modules 文件会被打包到 vendors 组的 chunk 中 */} vendors~xxx.js
        // 满足上面的公共规则，如：大小超过 30kb，至少被引用一次
        vendors: {
          test: /[\\\\/]node_modules[\\\\/]/,
          priority: -10, // 优先级
        },
        default: {
          // 要提取的 chunk 最少要被引用两次
          minChunks: 2, // 这个规则会覆盖上面规则的值
          priority: -20, // 优先级，这个要低一点
          // 如果当前要打包的模块和之前已经被提取的模块是同一个就会复用，而不是重新打包模块
          reuseExistingChunk: true,
        },
      },
      */
    },
    // 将当前模块的记录其他模块的 hash 单独打包为一个文件 runtime
    // 解决：修改 a 文件导致 b 文件的 contenthash 变化
    runtimeChunk: {
      name: (entrypoint) => `runtime-${entrypoint.name}`,
    },
    // 配置生产环境的压缩方案：js 和 css
    minimizer: [
      new TerserWebpackPlugin({
        cache: true, // 开启缓存
        parallel: true, // 开启多进程打包
        sourceMap: true, // 启用 source-map
      }),
    ],
  },
}
```