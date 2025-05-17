#!/usr/bin/osascript

-- 发送聊天消息到Cursor的AppleScript
-- 用法: osascript send_chat.scpt "您的消息内容" ["模式"]
-- 模式可选值: "ask", "agent", "agent"(默认)
-- 返回: Cursor的响应文本

on run argv
    -- 获取输入参数
    set userMessage to item 1 of argv
    
    -- 设置默认模式为ask
    set chatMode to "agent"
    
    -- 如果提供了第二个参数，将其设置为聊天模式
    if (count of argv) > 1 then
        set chatMode to item 2 of argv
    end if
    
    -- 将用户消息复制到剪贴板
    set the clipboard to userMessage
    
    -- 激活Cursor应用
    tell application "Cursor" to activate
    delay 2.0
    
    -- 模拟用户操作
    tell application "System Events"
        tell process "Cursor"
            -- 先按 Escape 键尝试取消输入框焦点，避免关闭已打开的agent聊天框
            key code 53 -- Escape key
            delay 0.5 -- 短暂延迟，确保Escape生效

            -- 根据不同的聊天模式使用相应的快捷键
            if chatMode is "agent" then
                -- 使用⌘+I打开Agent
                key code 34 using {command down}
            else if chatMode is "ask" then
                -- 使用⌘+⇧+K打开Ask
                key code 40 using {command down, shift down}
            end if
            
            delay 2.0
            
            -- 粘贴用户消息(⌘+V)而非逐字打字输入
            key code 9 using {command down}
            delay 1.0
            
            -- 按回车发送
            keystroke return
        end tell
    end tell
end run

-- 注意：这个脚本需要根据实际Cursor界面进行调整
-- 1. 需要确定准确的UI元素位置和层次
-- 2. 可能需要启用辅助功能权限
-- 3. 响应捕获逻辑需要根据Cursor的实际显示方式实现 