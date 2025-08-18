# 🧪 浏览器测试指南

## 如何测试Cursor远程控制应用

### 步骤1: 打开应用
1. 访问: http://localhost:8080
2. 打开浏览器开发者工具 (F12)
3. 切换到Console标签

### 步骤2: 自动连接测试
应用加载后，会自动运行连接测试。查看控制台输出：

```
🧪 开始Supabase连接测试...
✅ 环境配置检查通过
✅ Supabase库检查通过
✅ Supabase客户端初始化成功
🔍 测试RPC函数调用...
✅ get_system_status成功: {...}
✅ get_queue_status成功: {...}
✅ get_command_analytics成功: {...}
✅ get_command_templates_with_usage成功: {...}
✅ submit_command成功: {...}
🎉 所有测试完成！如果看到这条消息且没有错误，说明连接正常
```

### 步骤3: 手动测试连接
1. 点击右上角的WiFi图标 📶
2. 按钮会显示加载动画
3. 查看聊天界面的反馈消息
4. 查看控制台的详细输出

### 步骤4: 测试命令提交
1. 在输入框中输入: `echo "Hello World"`
2. 按 Ctrl+Enter 发送
3. 检查是否有错误消息

## 预期结果

### ✅ 成功情况
- 控制台显示所有测试通过
- 聊天界面显示绿色成功消息
- 没有404错误
- 能够正常提交命令

### ❌ 失败情况
如果看到错误，可能的原因：

1. **404错误**
   - Supabase数据库函数未部署
   - 解决：在Supabase控制台执行 `database/functions.sql`

2. **连接错误**  
   - Supabase URL或API密钥错误
   - 解决：检查 `client/env-config.js` 配置

3. **权限错误**
   - RLS策略配置问题
   - 解决：检查Supabase行级安全设置

## 故障排除

### 检查数据库部署
在Supabase控制台执行:
```sql
-- 快速检查
SELECT routine_name FROM information_schema.routines 
WHERE routine_schema = 'public' AND routine_name LIKE '%command%';
```

### 手动测试函数
```javascript
// 在浏览器控制台执行
runConnectionTest()
```

### 重置环境
如果问题持续存在：
1. 刷新浏览器页面
2. 清除浏览器缓存
3. 重启开发服务器: `cd client && python3 -m http.server 8080`

## 成功标志
当你看到以下内容时，说明404问题已解决：
- ✅ 所有连接测试通过
- ✅ 能够正常提交命令  
- ✅ 没有404或其他错误
- ✅ 实时更新正常工作

恭喜！🎉 你的Cursor远程控制应用现在应该可以正常工作了！
