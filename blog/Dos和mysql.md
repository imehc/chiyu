---
title: 'DOS 命令与 MySQL 常用操作指南'
date: '2021-08-18 10:35'
tags: ['DOS', 'MySQL']
draft: false
summary: 'Windows DOS 常用命令（端口管理、服务启停）与 MySQL 数据库基础操作命令速查'
---

## DOS 命令

{/* truncate */}

### 关闭端口占用

#### 查看所有端口

```cmd
netstat -ano
```

#### 查看指定端口

```cmd
netstat -ano | findstr "端口号"
```

#### 关闭端口

{/* 进程号就是查看端口号时靠右的那个数字 */}

```cmd
taskkill -PID 进程号 -F
```

或

```cmd
taskkill /PID 进程号 /F
```

### 启动 MySQL 服务

```cmd
net start mysql
```

{/* 如果出现服务名无效，则需要输入 mysqld --install 再次启动即可 */}

如果出现"服务名无效"错误，先执行：

```cmd
mysqld --install
```

然后再启动：

```cmd
net start mysql
```

### 停止 MySQL 服务

```cmd
net stop mysql
```

---

## MySQL 命令

### 连接与退出

#### 登录 MySQL

```cmd
mysql -u 用户名 -p
```

然后输入密码。

或直接在命令行输入密码（不安全，不推荐）：

```cmd
mysql -u 用户名 -p密码
```

#### 指定主机登录

```cmd
mysql -h 主机地址 -u 用户名 -p
```

例如：

```cmd
mysql -h localhost -u root -p
mysql -h 127.0.0.1 -u root -p
```

#### 退出 MySQL

```sql
exit;
-- 或
quit;
-- 或
\q
```

### 数据库操作

#### 查看所有数据库

```sql
SHOW DATABASES;
```

#### 创建数据库

```sql
CREATE DATABASE 数据库名;
```

#### 指定字符集创建数据库

```sql
CREATE DATABASE 数据库名 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

#### 使用/切换数据库

```sql
USE 数据库名;
```

#### 查看当前使用的数据库

```sql
SELECT DATABASE();
```

#### 删除数据库

```sql
DROP DATABASE 数据库名;
```

#### 查看数据库创建语句

```sql
SHOW CREATE DATABASE 数据库名;
```

### 表操作

#### 查看所有表

```sql
SHOW TABLES;
```

#### 创建表

```sql
CREATE TABLE 表名 (
  字段名1 数据类型 [约束条件],
  字段名2 数据类型 [约束条件],
  ...
);
```

示例：

```sql
CREATE TABLE users (
  id INT PRIMARY KEY AUTO_INCREMENT,
  username VARCHAR(50) NOT NULL,
  email VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### 查看表结构

```sql
DESC 表名;
-- 或
DESCRIBE 表名;
-- 或
SHOW COLUMNS FROM 表名;
```

#### 查看创建表的 SQL 语句

```sql
SHOW CREATE TABLE 表名;
```

#### 修改表

##### 添加字段

```sql
ALTER TABLE 表名 ADD 字段名 数据类型;
```

##### 修改字段

```sql
ALTER TABLE 表名 MODIFY 字段名 新数据类型;
-- 或
ALTER TABLE 表名 CHANGE 旧字段名 新字段名 数据类型;
```

##### 删除字段

```sql
ALTER TABLE 表名 DROP 字段名;
```

##### 重命名表

```sql
RENAME TABLE 旧表名 TO 新表名;
-- 或
ALTER TABLE 旧表名 RENAME TO 新表名;
```

#### 删除表

```sql
DROP TABLE 表名;
```

#### 清空表数据

```sql
TRUNCATE TABLE 表名;
```

### 数据操作（CRUD）

#### 插入数据

```sql
INSERT INTO 表名 (字段1, 字段2, ...) VALUES (值1, 值2, ...);
```

插入多条：

```sql
INSERT INTO 表名 (字段1, 字段2) VALUES 
  (值1, 值2),
  (值3, 值4),
  (值5, 值6);
```

#### 查询数据

```sql
SELECT * FROM 表名;
```

条件查询：

```sql
SELECT * FROM 表名 WHERE 条件;
```

示例：

```sql
SELECT * FROM users WHERE id = 1;
SELECT username, email FROM users WHERE age > 18;
SELECT * FROM users WHERE username LIKE '%张%';
```

#### 更新数据

```sql
UPDATE 表名 SET 字段1 = 值1, 字段2 = 值2 WHERE 条件;
```

示例：

```sql
UPDATE users SET email = 'new@example.com' WHERE id = 1;
```

{/* 注意：一定要加 WHERE 条件，否则会更新所有记录 */}

#### 删除数据

```sql
DELETE FROM 表名 WHERE 条件;
```

示例：

```sql
DELETE FROM users WHERE id = 1;
```

{/* 注意：一定要加 WHERE 条件，否则会删除所有记录 */}

### 用户管理

#### 查看所有用户

```sql
SELECT user, host FROM mysql.user;
```

#### 创建用户

```sql
CREATE USER '用户名'@'主机' IDENTIFIED BY '密码';
```

示例：

```sql
CREATE USER 'test'@'localhost' IDENTIFIED BY '123456';
CREATE USER 'test'@'%' IDENTIFIED BY '123456';
```

#### 授权

```sql
GRANT 权限 ON 数据库.表 TO '用户名'@'主机';
```

示例：

```sql
-- 授予所有权限
GRANT ALL PRIVILEGES ON *.* TO 'test'@'localhost';

-- 授予特定数据库权限
GRANT ALL PRIVILEGES ON mydb.* TO 'test'@'localhost';

-- 授予特定权限
GRANT SELECT, INSERT, UPDATE ON mydb.* TO 'test'@'localhost';
```

#### 刷新权限

```sql
FLUSH PRIVILEGES;
```

#### 撤销权限

```sql
REVOKE 权限 ON 数据库.表 FROM '用户名'@'主机';
```

#### 删除用户

```sql
DROP USER '用户名'@'主机';
```

#### 修改密码

```sql
ALTER USER '用户名'@'主机' IDENTIFIED BY '新密码';
```

### 备份与恢复

#### 备份数据库（DOS 命令）

```cmd
mysqldump -u 用户名 -p 数据库名 > 备份文件.sql
```

示例：

```cmd
mysqldump -u root -p mydb > mydb_backup.sql
```

#### 恢复数据库（DOS 命令）

```cmd
mysql -u 用户名 -p 数据库名 < 备份文件.sql
```

示例：

```cmd
mysql -u root -p mydb < mydb_backup.sql
```

### 常用查询技巧

#### 排序

```sql
SELECT * FROM 表名 ORDER BY 字段 ASC;   -- 升序
SELECT * FROM 表名 ORDER BY 字段 DESC;  -- 降序
```

#### 分页

```sql
SELECT * FROM 表名 LIMIT 数量;
SELECT * FROM 表名 LIMIT 偏移量, 数量;
SELECT * FROM 表名 LIMIT 数量 OFFSET 偏移量;
```

示例：

```sql
SELECT * FROM users LIMIT 10;          -- 前10条
SELECT * FROM users LIMIT 0, 10;         -- 第1页，每页10条
SELECT * FROM users LIMIT 10 OFFSET 20; -- 第3页，每页10条
```

#### 聚合函数

```sql
SELECT COUNT(*) FROM 表名;        -- 计数
SELECT SUM(字段) FROM 表名;        -- 求和
SELECT AVG(字段) FROM 表名;        -- 平均值
SELECT MAX(字段) FROM 表名;        -- 最大值
SELECT MIN(字段) FROM 表名;        -- 最小值
```

#### 分组

```sql
SELECT 字段, COUNT(*) FROM 表名 GROUP BY 字段;
```

### 事务处理

#### 开启事务

```sql
START TRANSACTION;
-- 或
BEGIN;
```

#### 提交事务

```sql
COMMIT;
```

#### 回滚事务

```sql
ROLLBACK;
```

示例：

```sql
START TRANSACTION;
UPDATE accounts SET balance = balance - 100 WHERE id = 1;
UPDATE accounts SET balance = balance + 100 WHERE id = 2;
COMMIT;
```

---

## 常用 DOS 网络命令

### 查看 IP 配置

```cmd
ipconfig
```

查看详细信息：

```cmd
ipconfig /all
```

### 测试网络连接

```cmd
ping 目标地址
```

示例：

```cmd
ping www.baidu.com
ping 192.168.1.1
```

### 查看路由表

```cmd
route print
```

### 追踪路由

```cmd
tracert 目标地址
```

### 查看 ARP 缓存

```cmd
arp -a
```

### 刷新 DNS 缓存

```cmd
ipconfig /flushdns
```

### 查看系统信息

```cmd
systeminfo
```

### 查看进程列表

```cmd
tasklist
```

### 结束进程

```cmd
taskkill /IM 进程名 /F
```

示例：

```cmd
taskkill /IM notepad.exe /F
```
