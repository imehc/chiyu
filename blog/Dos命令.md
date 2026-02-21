---
title: 'Windows DOS 命令与 MySQL 基础操作速查'
date: '2021-08-20 17:02'
tags: ['DOS', 'MySQL']
draft: false
summary: 'Windows DOS 常用命令（端口管理、服务启停）与 MySQL 数据库连接命令速查手册'
---

## DOS 命令

<!-- truncate -->

### 端口管理

#### 查看所有端口

```cmd
netstat -ano
```

#### 查看指定端口

```cmd
netstat -ano | findstr "端口号"
```

#### 关闭端口

<!-- 进程号就是查看端口号时靠右的那个数字 -->

```cmd
taskkill -PID 进程号 -F
```

或

```cmd
taskkill /PID 进程号 /F
```

### MySQL 服务管理

#### 启动 MySQL 服务

```cmd
net start mysql
```

<!-- 如果出现服务名无效，则需要输入 mysqld --install 再次启动即可 -->

如果提示"服务名无效"，先安装服务：

```cmd
mysqld --install
```

然后再启动：

```cmd
net start mysql
```

#### 停止 MySQL 服务

```cmd
net stop mysql
```

---

## MySQL 命令

### 连接数据库

#### 完整格式

```cmd
mysql -h 主机地址 -u 用户名 -p
```

然后输入密码。

#### 本地连接（简写）

```cmd
mysql -u 用户名 -p
```

或直接在命令行输入密码（不安全，不推荐）：

```cmd
mysql -u 用户名 -p密码
```

#### 示例

```cmd
# 连接本地 MySQL
mysql -u root -p

# 连接指定主机
mysql -h localhost -u root -p
mysql -h 127.0.0.1 -u root -p

# 指定端口连接
mysql -h localhost -P 3306 -u root -p
```

### 常用 MySQL 操作命令

#### 数据库操作

```sql
-- 查看所有数据库
SHOW DATABASES;

-- 创建数据库
CREATE DATABASE 数据库名;

-- 使用数据库
USE 数据库名;

-- 删除数据库
DROP DATABASE 数据库名;
```

#### 表操作

```sql
-- 查看所有表
SHOW TABLES;

-- 查看表结构
DESC 表名;

-- 创建表
CREATE TABLE 表名 (
  id INT PRIMARY KEY AUTO_INCREMENT,
  name VARCHAR(50),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 删除表
DROP TABLE 表名;
```

#### 数据操作

```sql
-- 查询数据
SELECT * FROM 表名;
SELECT * FROM 表名 WHERE 条件;

-- 插入数据
INSERT INTO 表名 (字段1, 字段2) VALUES (值1, 值2);

-- 更新数据
UPDATE 表名 SET 字段 = 值 WHERE 条件;

-- 删除数据
DELETE FROM 表名 WHERE 条件;
```

#### 用户管理

```sql
-- 查看所有用户
SELECT user, host FROM mysql.user;

-- 创建用户
CREATE USER '用户名'@'主机' IDENTIFIED BY '密码';

-- 授权
GRANT ALL PRIVILEGES ON *.* TO '用户名'@'主机';

-- 刷新权限
FLUSH PRIVILEGES;
```

---

## 其他常用 DOS 命令

### 网络相关

```cmd
# 查看 IP 配置
ipconfig

# 查看详细 IP 配置
ipconfig /all

# 测试网络连接
ping 目标地址

# 刷新 DNS 缓存
ipconfig /flushdns

# 查看路由表
route print

# 追踪路由
tracert 目标地址
```

### 进程管理

```cmd
# 查看所有进程
tasklist

# 查看指定进程
tasklist | findstr "进程名"

# 结束进程（按 PID）
taskkill /PID 进程号 /F

# 结束进程（按进程名）
taskkill /IM 进程名 /F
```

### 文件和目录

```cmd
# 查看当前目录
cd

# 切换目录
cd 目录路径

# 返回上级目录
cd ..

# 列出目录内容
dir

# 创建目录
mkdir 目录名

# 删除目录
rmdir 目录名

# 删除文件
del 文件名

# 复制文件
copy 源文件 目标文件

# 移动文件
move 源文件 目标文件
```

### 系统信息

```cmd
# 查看系统信息
systeminfo

# 查看当前用户名
whoami

# 查看环境变量
set

# 清屏
cls
```
