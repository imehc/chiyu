---
title: 'Docker 基础命令完全指南'
date: '2021-12-26 21:51'
tags: ['Docker']
draft: false
summary: 'Docker 容器与镜像管理完全指南：涵盖容器生命周期管理、端口映射、运行模式、镜像操作、Dockerfile 构建等核心命令'
---

# Docker 基础命令完全指南

{/* truncate */}

## 一、容器生命周期管理

### 1.1 创建并启动容器

```bash
# 基本语法
docker container run <Image Name>

# 示例：运行 nginx 容器
docker container run nginx
```

> 💡 **提示**：`docker run` 是 `docker container run` 的简写形式，两者功能相同。

### 1.2 查看运行中的容器

```bash
docker container ls
```

**输出字段说明**：

| 字段 | 说明 | 示例值 |
|------|------|--------|
| `CONTAINER ID` | 容器唯一标识符（短 ID） | `a1b2c3d4e5f6` |
| `IMAGE` | 使用的镜像名称 | `nginx:latest` |
| `COMMAND` | 容器启动时执行的命令 | `"nginx -g 'daemon of..."` |
| `CREATED` | 容器创建时间 | `2 minutes ago` |
| `STATUS` | 容器状态（`Up` 运行中 / `Exited` 已停止） | `Up 5 minutes` |
| `PORTS` | 端口映射信息 | `0.0.0.0:80->80/tcp` |
| `NAMES` | 容器名称（可自定义） | `my-nginx` |

### 1.3 停止容器

```bash
# 基本语法
docker container stop <Name or ID>

# 示例：停止 nginx 容器
docker container stop nginx
```

### 1.4 查看所有容器（包括已停止）

```bash
docker container ls -a
```

### 1.5 删除容器

```bash
# 基本语法
docker container rm <Name or ID>

# 示例：删除 nginx 容器
docker container rm nginx
```

> ⚠️ **注意**：无法删除正在运行的容器，除非使用 `-f` 强制删除。

### 1.6 批量操作容器

```bash
# 只查看容器 ID（用于批量操作）
docker container ps -aq

# 停止所有容器
docker container stop $(docker container ps -aq)

# 删除所有容器
docker container rm $(docker container ps -aq)

# 强制删除正在运行的容器
docker container rm -f <ID or Image Name>
```

---

## 二、端口映射与网络

### 2.1 端口映射

```bash
# 基本语法
docker container run -p <Host Port>:<Container Port> <Image Name>

# 示例：将主机的 80 端口映射到容器的 80 端口
docker container run -p 80:80 nginx
```

> 📌 **说明**：
> - 第一个端口：`Host` 主机（服务器）映射到本机的端口
> - 第二个端口：`Docker` 容器内部使用的端口

---

## 三、容器运行模式

### 3.1 运行模式对比

| 模式 | 英文 | 特点 | 适用场景 |
|------|------|------|----------|
| **前台模式** | `attached` | 实时显示输出，占用终端 | 调试阶段 |
| **后台模式** | `detached` | 在后台运行，释放终端 | 生产阶段 |

### 3.2 后台模式（Detached）

```bash
# 启动后台运行容器
docker run -d -p <Port:Port> <Image Name>

# 示例
docker run -d -p 80:80 nginx

# 或完整写法
docker run --detach -p 80:80 nginx
```

### 3.3 模式转换与日志查看

```bash
# detached 模式转换为 attached 模式
docker attach <ID or Image Name>

# 示例
docker attach 160edde86d6231d20af39b37f3e1986cf89d847547d815dea29d2e098665b53d

# 查看日志（追踪一次）
docker container logs <ID or Image Name>

# 示例
docker container logs 160edde86d6231d20af39b37f3e1986cf89d847547d815dea29d2e098665b53d

# 查看日志（动态追踪，类似 tail -f）
docker container logs -f <ID or Image Name>

# 示例
docker container logs -f 160edde86d6231d20af
```

---

## 四、交互模式

### 4.1 直接启动交互模式

```bash
docker container run -it ubuntu sh
```

**参数说明**：
- `-i` (`--interactive`)：保持 `STDIN` 打开，允许交互
- `-t` (`--tty`)：分配一个伪终端
- `sh`：启动 `Shell` 进行交互

### 4.2 进入正在运行的容器（Detached 模式）

```bash
# 步骤 1：先以 detached 模式启动容器
docker container run -d -p 80:80 nginx

# 步骤 2：进入容器的交互模式
docker exec -it <ID or Image Name> sh
```

**参数说明**：
- `exec`：在运行中的容器内执行命令
- `-it`：启用交互模式
- `sh`：使用 `Shell` 脚本进行交互

> 💡 **提示**：使用 `docker exec` 进入容器后，退出时（`exit`）**不会停止**容器。

---

## 五、镜像管理

### 5.1 拉取镜像

```bash
# 从 Docker Hub 拉取（默认源）
docker image pull <Name>

# 示例：拉取 WordPress 最新版
docker image pull wordpress
# 或指定版本
docker image pull wordpress:latest

# 从第三方仓库拉取（如 quay.io）
docker pull quay.io/presslabs/wordpress-operator
```

> 📌 **说明**：`:latest` 代表最新版本标签。

### 5.2 查看镜像

```bash
# 列出本地所有镜像
docker image ls

# 查看镜像详细信息
docker image inspect <Image ID>
```

### 5.3 删除镜像

```bash
# 基本语法
docker image rm <Image ID>

# 或按名称删除
docker image rm <Name:Tag>
```

> ⚠️ **注意**：如果有容器正在使用该镜像，无法删除。需要先停止并删除相关容器。

### 5.4 镜像导入导出

#### 导出镜像

```bash
# 基本语法
docker image save <Image Name>:<Tag> -o <File Name>

# 示例：导出 busybox 镜像
docker image save busybox:latest -o mybusybox.image
```

**参数说明**：
- `save`：保存镜像
- `busybox:latest`：镜像名称及版本号
- `-o`：输出到文件
- `mybusybox.image`：导出的文件名

#### 导入镜像

```bash
# 基本语法
docker image load -i <File Path>

# 示例：从文件导入镜像
docker image load -i ./mybusybox.image
```

---

## 六、Dockerfile 构建镜像

### 6.1 构建命令

```bash
# 基本语法
docker image build -t <Name:Tag> <File Path>

# 示例：在当前目录构建镜像，标签为 richoo:latest
docker image build -t richoo .
```

**参数说明**：
- `-t` (`--tag`)：给镜像打标签，格式为 `name:tag`
- `.`：指定 `Dockerfile` 所在路径（当前目录）

### 6.2 验证构建结果

```bash
# 当出现 FINISHED，说明打包完成
# 执行容器验证是否可用
docker run richoo
```

---

## 七、常用命令速查表

### 7.1 容器命令

| 命令 | 说明 |
|------|------|
| `docker run` | 创建并启动容器 |
| `docker ps` / `docker container ls` | 查看运行中容器 |
| `docker ps -a` | 查看所有容器 |
| `docker stop <ID>` | 停止容器 |
| `docker start <ID>` | 启动已停止容器 |
| `docker rm <ID>` | 删除容器 |
| `docker exec -it <ID> sh` | 进入容器交互模式 |
| `docker logs -f <ID>` | 查看容器日志 |

### 7.2 镜像命令

| 命令 | 说明 |
|------|------|
| `docker pull <Image>` | 拉取镜像 |
| `docker images` / `docker image ls` | 查看本地镜像 |
| `docker rmi <ID>` | 删除镜像 |
| `docker save -o <File> <Image>` | 导出镜像 |
| `docker load -i <File>` | 导入镜像 |
| `docker build -t <Tag> .` | 构建镜像 |

---

## 八、最佳实践

1. **命名规范**：使用 `--name` 为容器指定有意义的名称，便于管理
   ```bash
   docker run -d --name my-nginx -p 80:80 nginx
   ```

2. **自动清理**：使用 `--rm` 参数，容器停止后自动删除
   ```bash
   docker run --rm -it ubuntu sh
   ```

3. **资源限制**：生产环境建议设置内存和 CPU 限制
   ```bash
   docker run -d --memory="512m" --cpus="1.0" nginx
   ```

4. **数据持久化**：使用 `-v` 挂载卷，防止数据丢失
   ```bash
   docker run -d -v /host/data:/container/data nginx
   ```

---

**总结**：本文档涵盖了 `Docker` 容器与镜像的核心操作命令，从基础的生命周期管理到进阶的镜像构建，适合初学者快速上手和日常查阅参考。
