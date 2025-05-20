on run {myPrompt, initialChatMode, targetApplicationName}
    -- 确保 targetApplicationName 不为空，否则默认为 "Cursor"
    if targetApplicationName is "" then
        set targetApplicationName to "Cursor"
    end if

    try
        tell application targetApplicationName
            activate
        end tell

        -- 延迟以确保应用程序已激活并准备就绪
        delay 1.0 -- 略微调整延迟

        tell application "System Events"
            -- 首先按 Escape 键尝试取消任何现有焦点，以避免干扰
            key code 53 -- Escape 键
            delay 0.5 -- 短暂延迟以确保 Escape 生效

            if initialChatMode is "agent" then
                -- Agent 模式 (例如: Cursor中的 Cmd+I)
                key code 34 using {command down} -- Cmd+I
                delay 0.7 -- 等待 agent 界面出现
                -- 将用户消息粘贴 (Cmd+V)
                set the clipboard to myPrompt
                delay 0.2
                key code 9 using {command down} -- Cmd+V (粘贴)
                delay 0.5
                key code 36 -- Enter 键
            else if initialChatMode is "chat" then
                -- Chat 模式 (例如: Cursor中的 Cmd+K)
                -- VS Code (Copilot Chat): 可能需要配置为此快捷键
                key code 40 using {command down} -- Cmd+K 
                delay 0.7 -- 等待聊天界面出现
                -- 将用户消息粘贴 (Cmd+V)
                set the clipboard to myPrompt
                delay 0.2
                key code 9 using {command down} -- Cmd+V (粘贴)
                delay 0.5
                key code 36 -- Enter 键
            else if initialChatMode is "ask" then
                -- Ask 模式 (例如: Cursor中的 Cmd+L 或 Cmd+Shift+K, 取决于版本和配置)
                -- VS Code (Copilot Chat): "Chat: Ask Copilot" 通常通过命令面板
                -- 此处的 Cmd+L 是一个示例, 请根据您的 Cursor/VS Code 配置进行验证/修改
                key code 37 using {command down} -- Cmd+L (示例)
                delay 0.7 -- 等待提问界面出现
                -- 将用户消息粘贴 (Cmd+V)
                set the clipboard to myPrompt
                delay 0.2
                key code 9 using {command down} -- Cmd+V (粘贴)
                delay 0.5
                key code 36 -- Enter 键
            else
                -- 未知模式的回退或错误处理
                return "Error: Unknown initialChatMode '" & initialChatMode & "'"
            end if
        end tell
        
        return "Successfully sent command to " & targetApplicationName

    on error errMsg number errNum
        return "Error " & errNum & ": " & errMsg & " while trying to control " & targetApplicationName
    end try
end run