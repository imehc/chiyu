`ls`
查看当前文件夹下的所有文件、文件夹
`ls -a`
查看当前文件夹下的所有文件、文件夹(包括隐藏的)
`ls -l`或`ll`
查看文件夹下的所有文件、文件夹。带有详情信息
`pwd`
查看当前路径
`cd 路径`
切换路径，可使用table补全
`cd ..`
返回上一个文件夹
`cd /`
返回根目录
`cd ~`
返回root目录
`cd -`
返回上一次所在的目录
`mkdir	目录名称`
创建目录
`rmdir 目录名称`
删除目录
`mkdir -p 目录1/目录2`
创建多级目录
`cat 文件`
查看文件的所有内容
`more 文件`
查看文件的内容，通过回车查看，或者空格，按q或ctrl+c退出
`less 文件`
与more类似，不同的是less可以通过pageup、pagedown控制
`tail -10 文件`
查看当前文件最后十行
`tail -f 文件`
动态查看文件
`cp 拷贝的文件 拷贝的目标路径`
拷贝文件到指定路径
`cp 拷贝的文件 拷贝的目标路径/自定义名称`
拷贝文件到指定路径并自定义名称
`mv 剪切的文件 剪切到的目标路径`
同cp，只不过这是剪切
`mv 剪切的文件 剪切到的目标路径/自定义名称`
同cp，只不过这是剪切
`rm 文件`
删除文件，y删除，n取消删除
`rm -r 文件夹`
删除文件夹，y删除，n取消删除 
`rm -rf 文件夹`
不询问，直接删除文件夹
`tar -cvf 文件`
打包
`tar -zcvf 文件`
打包并压缩
`tar -xvf 文件`
解压
`tar -zxvf 文件`
解压压缩
`tar -xvf 文件 -C 路径`
解压压缩到指定路径
`find 目录 -name 文件`
在那个目录按文件名称查找
`find 目录 -name 文件名*`
在那个目录按文件名称以什么开头模糊查找
`grep 字符串名称 搜索路径 --color -A1 -B1`
在那个路径搜索那个字符串，--color高亮显示搜索字符串.-A1额外显示前面一行，-B1后面一行
`touch 文件`
创建一个空文件
`clear`
清屏

`vim 文件名字`
按`i`插入 ，退出按`esc`，输入`:q`,保存并退出`:wq`,不保存退出`:q!

`cat 文件1>文件2`
文件1的内容放到文件2保存（覆盖）
`cat 文件1>>文件2`
文件1的内容放到文件2保存（追加）
`ifconfig`
查看IP地址
`ps -ef`
查看正在运行的进程
`ps -ef | grep 字符串`
搜索进程中包含 某某的进程
`kill -p 进程id`
强制关闭进程

`chmod u=rwx,g=r,o=w 文件`
修改权限，u当前用户，g当前组其它用户，o其他组用户
r (4)读，w(2)写，x(1)执行，			 -文件，d文件夹，l连接
例如：`chmod 755 文件`

`hostname`
主机名
`hostname 新名称`
修改主机名（重启无效），想永久生效，修改`/etc/sysconfig/network`文件

`service network restart`
重启网络服务
`service network stop`
停止服务
`service network start`
启动服务
`service  -status-all`
查看系统所有后台服务
`netstat -nltp`
查看网络进程端口监听情况
`service iptables status`
查看防火墙状态
`service iptables stop`
关闭防火墙
`service iptables stop`
关闭防火墙
`chkconfig iptables off`
禁止防火墙自启
`ifconfig eth0 192.168.12.22`
修改ip地址（重启无效），永久生效，修改`/etc/sysconfig/network-scripts/ifcfg-eth0`文件

`/etc/hosts`文件用于主机名进行访问做ip地址解析

`yum install 包名称`
linux安装软件

