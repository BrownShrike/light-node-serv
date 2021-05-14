<h1 align="center">
	light-node-serv [![NPM version](https://img.shields.io/npm/v/light-node-serv.svg)](https://www.npmjs.com/package/light-node-serv)
	<br>
	<br>
</h1>

# 快速开始

### 简介

使用此框架可以快速搭建一套可用的node服务，带有可选装模块如mysql、导出xlsx文件、解析xlsx文件、文件上传、定时任务等。

### 安装

1. npm install light-node-serv
2. 在命令行执行 light-node-serv single -p your-project-name
3. 根据需要选装不同的模块


### 启动

1. 在新建的工程根目录下执行 yarn dev 或 npm run dev，可在本地运行node服务，默认端口8977，在修改代码后会自动编译运行。
2. 服务启动后，可向http://127.0.0.1:8977发起post请求，结果如下
    请求参数：
    ```
    // 请求参数
    {
        "FN": "test",
        "param": ["tom", 18]
    }

    // 请求结果
    {
        "code": "0000",
        "msg": "The service is running successfully",
        "data": {
            "name": "tom",
            "age": 18
        },
        "process": ""
    }
    ```
3. 服务启动后在工程目录会自动创建pm2log文件夹，包含pm2-err-\*.log和pm2-out-\*.log，报错输出在err日志，用户自定义console输出在out日志，建议开发中使用tail -f pm2-out-\*.log来监控日志查看调试输出

### 打包

* 在根目录下执行yarn build 或 npm run build，将生成dist文件夹，包含app.js、process.json和report.html文件，其中report.html文件是打包结果分析文件(可删除)，其他两个文件为业务功能文件，使用pm2 start process.json可运行打包后的服务。

### 日志

* 框架需要使用pm2-logrotate来管理日志输出，安装命令：pm2 install pm2-logrotate@2.2.0


# 模块解析

### distributer.ts

* 这是分发请求的模块，在单服务文件模式下(single)，该模块将所有请求转发到/services/service.ts服务中。在多服务模式下(multiple，暂未开发完成)，根据请求中的SN转发到不同的服务中


### polyfill.ts

* 该文件是补丁程序，主要重写了console方法，加入了输出控制及标记


### utils.ts

* 定义了通用返回值模型，请求方法和uuid方法


### mysql.ts

* 数据库操作模块，自动创建连接池，提供执行普通sql和事务的方法
  * index.ts
    ```
    // 初始化数据库连接池
    Mysql.init([process.env.MYSQL_DATABASE]);   //  此处使用process.json中配置的数据库
    ```
  * service.ts
    ```
    import { Mysql } from '@/modules/optional/mysql';
    import { PoolConnection } from 'mysql';

    // 普通sql查询
    async testSql(_name: string, _age: number) {
        const query_sql = 'select * from your-table where 1';
        var query_result: any = await Mysql.doSql(<string>process.env.MYSQL_DATABASE, query_sql).catch((err) => {
            return err;
        });
        
        if (query_result.err) {
            return ResponseResult.ERROR('查询报错');
        }
        return ResponseResult.SUCCESS('查询成功', query_result.data);
    }

    // 事务操作
    async testTransaction() {
        const r1 = Math.ceil(Math.random() * 10);
        const sql1 = `insert into school(school_id, school_name) values("id-${r1}", "name-${r1}")`;
        const sql2 = `insert into student(name, age, school_id) value("sname-${r1}", "${r1}", "id-${r1}")`;

        const connections: PoolConnection[] = [];
        try {
            const result1: any = await Mysql.doTransaction(<string>process.env.MYSQL_DATABASE, sql1);
            if (result1.err) {
                throw new Error('sql1执行失败，回滚');
            } else {
                connections.push(<PoolConnection>result1.instance);
            }

            const result2: any = await Mysql.doTransaction(<string>process.env.MYSQL_DATABASE, sql2);
            if (result2.err) {
                throw new Error('sql2执行失败，回滚');
            } else {
                connections.push(<PoolConnection>result2.instance);
            }

            // 提交
            const commitResult = await Mysql.transaCommit(connections);
            return ResponseResult.SUCCESS('事务执行成功', commitResult);

        } catch (error) {
            Mysql.transaRollback(connections);
            return ResponseResult.ERROR('事务执行失败');
        }
    }
    ```


### exportFile.ts

* 目前提供数据以xlsx文档导出，请求地址http://127.0.0.1:8977/exportfile，参数{"order": "e1"}，这里的order参数可以自定义，前后端约定好可以互相识别意图就OK
  * httpStarter.ts
    ```
    import xlsx from 'node-xlsx';
    import { exportFile } from '@/modules/optional/exportFile';

    // 接收导出文件请求 可以使用表单请求该接口
    this.router.post('/exportfile', async (ctx, _next) => {
        exportFile.worker(ctx.request.body).then(
            (res: any) => {
                if (res.code === '0000') {
                    // 直接下载文件
                    const file = xlsx.build([{
                        name: res.data.name,
                        data: res.data.data
                    }]);
                    ctx.response.set('Content-Type', 'application/vnd.openxmlformats')
                    ctx.response.set("Content-Disposition", "attachment; filename=" + encodeURIComponent(res.data.name))
                    ctx.response.body = file;
                } else {
                    console.error(SystemService.parseFileService, '文件导出失败', res);
                    ctx.response.body = ResponseResult.ERROR('文件导出失败', res);
                }
            }
        ).catch((error) => {
            console.error(SystemService.parseFileService, '文件导出失败', error);
            ctx.response.body = ResponseResult.ERROR('文件导出失败');
        })
    });
    ```

### parseXlsx.ts

* 解析xlsx文件模块，请求地址http://127.0.0.1:8977/parsexlsx，参数{"order": "p1"}，这里的order参数可以自定义，前后端约定好可以互相识别意图就OK
  * httpStarter.ts
    ```
    // 接收excel文件并解析 - 未保存
    this.router.post('/parsexlsx', koaBody({
        multipart: true,
        formidable: {
            maxFileSize: maxFileSize
        }
    }), async (ctx, _next) => {
        const tempFile = <any>ctx.request.files;
        const uuid = UUID();
        console.log(SystemService.parseFileService, '请求ID：' + uuid ,'解析文件请求', ctx.request.body, tempFile);
        parseXlsx.work(ctx.request.body, tempFile).then(
            (res) => {
                const result = ResponseResult.SUCCESS('success', res);
                console.log(SystemService.parseFileService, '请求ID：' + uuid ,'解析文件结果', result);
                ctx.response.body = result;
            },
            (err) => {
                console.error(SystemService.parseFileService, '请求ID：' + uuid ,'解析文件失败', err);
                ctx.response.body = ResponseResult.ERROR_UNKNOWN('读取文件失败');
            }
        )
    });
    ```


### uploadFile.ts

* 接收文件上传模块，上传目录默认是/public/upload/，请求地址http://127.0.0.1:8977/upload
  * httpStarter.ts
    ```
    /**
    * 处理文件上传请求
    * 因为全局使用会和bodyparse中间件冲突
    */
        uploadFile.init();  // 创建public/upload目录
        this.router.post('/upload', koaBody({
        multipart: true,
        // json: false,
        formidable: {
            maxFileSize: maxFileSize
        }
    }), async (ctx, _next) => {
        const tempFile = <any>ctx.request.files;
        await uploadFile.work(ctx.request.body, tempFile).then(
            (res) => {
                ctx.response.body = ResponseResult.SUCCESS('文件上传成功', res);
            }
        ).catch(
            (error) => {
                console.error(SystemService.uploadFileService, ' 上传文件服务错误 ', error);
                // 返回信息
                ctx.response.body = ResponseResult.ERROR_UNKNOWN('文件上传失败', null, '上传文件服务失败');
            }
        );
    });
    ```

### schedule.ts

* 执行定时任务模块，定时使用node-schedule模块
  * index.ts
    ```
    // 开启定时任务
    ScheduleJob.startSchedule();
    ```

# 其他

### Contributors（In no particular order）

* Luxiandong
* Yangfengming