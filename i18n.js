/**
 * ST-TagSweeper — 介面翻譯 / UI translations
 *
 * 字典的 key 就是「繁體中文原文」，所以：
 *   - zh-Hant 直接回傳原文，不需要額外維護；
 *   - zh-Hans / en 放在表裡；
 *   - 有動態數字的句子放在 PATTERNS，用 {0} {1} 佔位。
 *
 * 翻譯有兩種套用方式：
 *   1. tr(key, vars)      —— JS 產生字串時直接翻（通知、彈窗、斜線命令）；
 *   2. localizeTree(root) —— 面板 DOM 掛載 / 重繪後，掃描文字節點與 title/placeholder。
 * 任何一條沒翻到時只會停在繁體原文，不會露出 key。
 */

export const LOCALES = ['auto', 'zh-Hant', 'zh-Hans', 'en'];

export const LOCALE_NAMES = {
    auto: '跟隨酒館',
    'zh-Hant': '繁體中文',
    'zh-Hans': '简体中文',
    en: 'English',
};

/* ========================================================================
 * 一般字串
 * ===================================================================== */
export const TABLE = {
    // 面板：標題列 / 工具列
    '一鍵去正則保正文': ['一键去正则保正文', 'Tag Sweeper'],
    '選用：手動暫停所有正則，方便對照原文；再按一次還原': [
        '选用：手动暂停所有正则，方便对照原文；再按一次还原',
        'Optional: pause all regex scripts to compare the raw text; press again to restore',
    ],
    '正則：未暫停': ['正则：未暂停', 'Regex: running'],
    '收合 / 展開': ['收合 / 展开', 'Collapse / expand'],
    '隱藏面板（快捷鍵可再叫回）': ['隐藏面板（快捷键可再叫回）', 'Hide the panel (hotkey brings it back)'],
    '重新掃描當前聊天檔案': ['重新扫描当前聊天文件', 'Rescan the current chat file'],
    '掃描': ['扫描', 'Scan'],
    '依目前的設定清除所有標籤內容': ['依目前的设置清除所有标签内容', 'Remove everything tagged, using the current settings'],
    '一鍵清除': ['一键清除', 'Clean now'],
    '回滾到上一個自動備份點': ['回滚到上一个自动备份点', 'Roll back to the previous automatic backup'],
    '回滾上次': ['回滚上次', 'Undo last'],
    '使用說明': ['使用说明', 'Help'],
    '尚未掃描。按「掃描」開始。': ['尚未扫描。按“扫描”开始。', 'Not scanned yet. Press "Scan" to start.'],
    '就緒': ['就绪', 'Ready'],

    // 分頁
    '標籤處理': ['标签处理', 'Tags'],
    '外殼': ['外壳', 'Wrappers'],
    '預覽': ['预览', 'Preview'],
    '白名單': ['白名单', 'Whitelist'],
    '設定': ['设置', 'Settings'],

    // 標籤頁
    '全部消除': ['全部消除', 'Remove all'],
    '顯示已隱藏': ['显示已隐藏', 'Show hidden'],
    '篩選標籤…': ['筛选标签…', 'Filter tags…'],
    '隱藏列出的': ['隐藏列出的', 'Hide listed'],
    '把目前列表上（含篩選結果）的標籤都設成隱藏。隱藏只是不顯示，還是會照規則處理。': [
        '把目前列表上（含筛选结果）的标签都设成隐藏。隐藏只是不显示，还是会照规则处理。',
        'Hide every tag currently listed (filter included). Hidden tags are only hidden from view — they are still processed.',
    ],
    '紅框＝消除': ['红框＝消除', 'Red box = remove'],
    '綠框＝白名單': ['绿框＝白名单', 'Green box = whitelist'],
    '破損': ['破损', 'Broken'],
    '不理會': ['不理会', 'Leave'],
    '消除': ['消除', 'Remove'],
    '白名單': ['白名单', 'Whitelist'],
    '（找不到來源訊息）': ['（找不到来源消息）', '(source message not found)'],
    '跳到這條訊息': ['跳到这条消息', 'Jump to this message'],
    '取消隱藏（重新顯示在清單上）': ['取消隐藏（重新显示在列表上）', 'Unhide (show it again)'],
    '隱藏這個標籤（只是不顯示，仍然照規則消除）': [
        '隐藏这个标签（只是不显示，仍然照规则消除）',
        'Hide this tag (hidden only — it is still removed)',
    ],
    '勾選＝消除（連裡面的內容一起刪掉）': ['勾选＝消除（连同里面的内容一起删掉）', 'Checked = remove (content included)'],
    '勾選＝加入白名單（保留內容，只脫掉 <> 外殼）；白名單裡的內容永遠不會被消除': [
        '勾选＝加入白名单（保留内容，只脱掉 <> 外壳）；白名单里的内容永远不会被消除',
        'Checked = whitelist (keep the content, strip the < > wrapper); whitelisted content is never removed',
    ],
    '這個聊天檔案裡沒有偵測到任何 < > 標籤。': [
        '这个聊天文件里没有检测到任何 < > 标签。',
        'No < > tags were found in this chat file.',
    ],
    '沒有符合篩選條件的標籤。': ['没有符合筛选条件的标签。', 'No tags match the filter.'],

    // 外殼頁
    '左界': ['左界', 'Left'],
    '右界': ['右界', 'Right'],
    '新增外殼': ['新增外壳', 'Add wrapper'],
    '完全匹配移除': ['完全匹配移除', 'Remove exact matches'],
    '要移除的內容': ['要移除的内容', 'Text to remove'],
    '加入': ['加入', 'Add'],
    '目前沒有外殼。': ['目前没有外壳。', 'No wrappers yet.'],
    '已啟用': ['已启用', 'Enabled'],
    '已停用': ['已停用', 'Disabled'],
    '原生 < > 標籤，內容取捨看白名單': ['原生 < > 标签，内容取舍看白名单', 'The native < > tags; content is decided by the whitelist'],
    '整段消除': ['整段消除', 'Remove whole'],
    '只脫殼': ['只脱壳', 'Unwrap only'],
    '未命中': ['未命中', 'No match'],
    '未命中。': ['未命中。', 'No match.'],
    '/ 收束': ['/ 收束', '/ terminator'],
    '右界前面要有 / 才算結尾，點一下取消': [
        '右界前面要有 / 才算结尾，点一下取消',
        'The closing side must be preceded by / — click to disable',
    ],
    '點一下改成右界前面要有 / 才算結尾': [
        '点一下改成右界前面要有 / 才算结尾',
        'Click to require a / before the closing side',
    ],
    '刪除': ['删除', 'Delete'],
    '目前沒有指定要移除的內容。': ['目前没有指定要移除的内容。', 'Nothing to remove yet.'],

    // 預覽頁
    '顯示刪除內容：關': ['显示删除内容：关', 'Show deletions: off'],
    '顯示刪除內容：開': ['显示删除内容：开', 'Show deletions: on'],
    '手動編輯內容': ['手动编辑内容', 'Edit manually'],
    '結束編輯': ['结束编辑', 'Done editing'],
    '上一條': ['上一条', 'Previous'],
    '下一條': ['下一条', 'Next'],
    '撤銷': ['撤销', 'Undo'],
    '重做': ['重做', 'Redo'],
    '保存': ['保存', 'Save'],
    '取消': ['取消', 'Cancel'],
    '沒有需要改寫的訊息。': ['没有需要改写的消息。', 'Nothing to rewrite.'],
    '紅色是要刪掉的內容，可以直接改或整段刪掉。': [
        '红色是要删掉的内容，可以直接改或整段删掉。',
        'Red text is what will be deleted — edit or delete it freely.',
    ],

    // 白名單頁
    '輸入標籤名，例如 plot、content、正文、!--': [
        '输入标签名，例如 plot、content、正文、!--',
        'Tag name, e.g. plot, content, 正文, !--',
    ],
    '加入白名單': ['加入白名单', 'Add to whitelist'],
    '載入內建正文標籤': ['载入内置正文标签', 'Load built-in body tags'],
    '清空白名單': ['清空白名单', 'Clear whitelist'],
    '匯出成文字': ['导出成文字', 'Export as text'],
    '從文字匯入': ['从文字导入', 'Import from text'],
    '白名單是空的：目前所有標籤都會被連內容刪掉。': [
        '白名单是空的：目前所有标签都会被连内容删掉。',
        'The whitelist is empty: every tag will be removed with its content.',
    ],
    '從白名單移除': ['从白名单移除', 'Remove from whitelist'],

    // 設定頁
    '掃描範圍': ['扫描范围', 'Scan scope'],
    '包含用戶消息': ['包含用户消息', 'Include user messages'],
    '包含系統消息（/sys）': ['包含系统消息（/sys）', 'Include system messages (/sys)'],
    '同時清理所有 swipe 分支': ['同时清理所有 swipe 分支', 'Clean every swipe branch'],
    '同時清理「思維鏈」欄位（extra.reasoning）': [
        '同时清理“思维链”字段（extra.reasoning）',
        'Clean the reasoning field too (extra.reasoning)',
    ],
    '安全防護': ['安全防护', 'Safety'],
    '刪除後整理空行（不留連續空行、去頭尾空白）': [
        '删除后整理空行（不留连续空行、去首尾空白）',
        'Tidy blank lines after removal',
    ],
    '白名單裡的內容一律保留，即使它被包在更大的標籤裡也一樣。這條規則是固定的。': [
        '白名单里的内容一律保留，即使它被包在更大的标签里也一样。这条规则是固定的。',
        'Whitelisted content is always kept, even when nested inside a bigger tag. This rule is fixed.',
    ],
    '落單的結尾標籤：': ['落单的结尾标签：', 'Stray closing tag:'],
    '連同它前面的內容一起刪': ['连同它前面的内容一起删', 'Delete the text before it too'],
    '只刪掉標籤本身': ['只删掉标签本身', 'Delete only the tag'],
    '完全不動它': ['完全不动它', 'Leave it alone'],
    '　└ 要從哪裡開始砍：': ['　└ 要从哪里开始砍：', '　└ Where to start cutting:'],
    '上一個已完整收尾的標籤（建議）': ['上一个已完整收尾的标签（建议）', 'Last complete tag (recommended)'],
    '一律從訊息開頭砍': ['一律从消息开头砍', 'Always from the start of the message'],
    '只砍到上一個標籤': ['只砍到上一个标签', 'Only back to the previous tag'],
    '落單的開頭標籤：': ['落单的开头标签：', 'Stray opening tag:'],
    '刪到下一個標籤之前': ['删到下一个标签之前', 'Delete up to the next tag'],
    '刪到訊息結尾': ['删到消息结尾', 'Delete to the end of the message'],
    '正則（選用）': ['正则（选用）', 'Regex (optional)'],
    '暫時關閉所有正則': ['暂时关闭所有正则', 'Pause all regex scripts'],
    '還原正則': ['还原正则', 'Restore regex scripts'],
    '快捷鍵': ['快捷键', 'Hotkey'],
    '啟用快捷鍵開關面板': ['启用快捷键开关面板', 'Enable the hotkey'],
    '點這裡再按組合鍵': ['点这里再按组合键', 'Click, then press the keys'],
    '還原預設': ['还原默认', 'Reset to default'],
    '面板': ['面板', 'Panel'],
    '記住面板位置': ['记住面板位置', 'Remember panel position'],
    '重設面板位置': ['重设面板位置', 'Reset panel position'],
    '恢復出廠設定': ['恢复出厂设置', 'Reset all settings'],
    '備份點': ['备份点', 'Backups'],
    '保留份數': ['保留份数', 'Keep'],
    '立即建立備份點': ['立即创建备份点', 'Create backup now'],
    '匯入備份檔': ['导入备份文件', 'Import backup'],
    '介面語言': ['界面语言', 'Language'],
    '跟隨酒館': ['跟随酒馆', 'Follow SillyTavern'],
    '目前沒有任何備份點。': ['目前没有任何备份点。', 'No backups yet.'],
    '回滾': ['回滚', 'Roll back'],
    '下載': ['下载', 'Download'],
    '用這個備份點覆蓋當前聊天': ['用这个备份点覆盖当前聊天', 'Overwrite the current chat with this backup'],
    '這個備份點沒有內嵌資料，需用「匯入備份檔」還原': [
        '这个备份点没有内嵌数据，需用“导入备份文件”还原',
        'This backup has no embedded data — use "Import backup" to restore it',
    ],
    '僅檔案': ['仅文件', 'File only'],

    // 標籤統計 / 清單
    '出現': ['出现', 'Seen'],
    '用戶': ['用户', 'User'],
    '已手動編輯': ['已手动编辑', 'Edited by hand'],
    '含思維鏈欄位': ['含思维链字段', 'includes reasoning'],
    '⚠ 前面可能還有殘留': ['⚠ 前面可能还有残留', '⚠ possible residue above'],
    '⚠ 可能誤刪正文': ['⚠ 可能误删正文', '⚠ prose may be deleted'],
    '⚠ 可能誤刪正文（幾乎整條都會被清掉）': [
        '⚠ 可能误删正文（几乎整条都会被清掉）',
        '⚠ prose may be deleted (nearly the whole message would be cleared)',
    ],
    '這條訊息幾乎整條都會被清掉，正文可能不保。': [
        '这条消息几乎整条都会被清掉，正文可能不保。',
        'Nearly the whole message would be cleared — the prose may not survive.',
    ],
    '這條訊息開頭可能還有沒被清掉的內容。': [
        '这条消息开头可能还有没被清掉的内容。',
        'There may still be text above that was not cleared.',
    ],
    '成對': ['成对', 'paired'],
    '孤兒開': ['孤儿开', 'stray open'],
    '孤兒閉': ['孤儿闭', 'stray close'],
    '自閉合': ['自闭合', 'self-closing'],

    // 通知 / 狀態
    '下載失敗': ['下载失败', 'Download failed'],
    '儲存設定失敗': ['保存设置失败', 'Failed to save settings'],
    '暫停正則時發生錯誤': ['暂停正则时发生错误', 'Failed to pause regex scripts'],
    '暫停正則時出了點問題，詳情見控制台；清除功能本身不受影響。': [
        '暂停正则时出了点问题，详情见控制台；清除功能本身不受影响。',
        'Something went wrong while pausing regex scripts (see the console). The cleaning itself is unaffected.',
    ],
    '重載聊天失敗': ['重载聊天失败', 'Failed to reload the chat'],
    '還原正則時發生錯誤': ['还原正则时发生错误', 'Failed to restore regex scripts'],
    '還原正則失敗！請到「正則」面板手動把腳本勾回來，詳情見控制台。': [
        '还原正则失败！请到“正则”面板手动把脚本勾回来，详情见控制台。',
        'Could not restore the regex scripts. Re-enable them in the Regex panel (see the console for details).',
    ],
    '所有正則已暫時停用。關閉面板或按「立刻還原正則」就會復原。': [
        '所有正则已暂时停用。关闭面板或按“立刻还原正则”就会复原。',
        'All regex scripts are paused. Close the panel or press "Restore regex scripts" to undo this.',
    ],
    '目前沒有暫停任何正則。': ['目前没有暂停任何正则。', 'No regex scripts are paused.'],
    '群組聊天': ['群组聊天', 'Group chat'],
    '（未開啟聊天）': ['（未开启聊天）', '(no chat open)'],
    '未命名聊天': ['未命名聊天', 'Untitled chat'],
    '未開啟聊天': ['未开启聊天', 'No chat open'],
    '這個備份點沒有內嵌資料可匯出（可能是僅檔案備份）。': [
        '这个备份点没有内嵌数据可导出（可能是仅文件备份）。',
        'This backup has no embedded data to export (file-only backup).',
    ],
    '回滾聊天檔案': ['回滚聊天文件', 'Roll back the chat file'],
    '回滾前會再自動建立一個「當前狀態」的備份點，所以這一步本身也能反悔。': [
        '回滚前会再自动创建一个“当前状态”的备份点，所以这一步本身也能反悔。',
        'A "current state" backup is made before rolling back, so this step can itself be undone.',
    ],
    '確認回滾': ['确认回滚', 'Roll back'],
    '已取消回滾。': ['已取消回滚。', 'Rollback cancelled.'],
    '回滾前自動備份': ['回滚前自动备份', 'Automatic backup before rollback'],
    '目前沒有已載入的聊天，無法回滾。': ['目前没有已加载的聊天，无法回滚。', 'No chat is loaded, so there is nothing to roll back.'],
    '回滾後重載聊天失敗': ['回滚后重载聊天失败', 'Failed to reload the chat after rollback'],
    '已回滾到指定備份點。': ['已回滚到指定备份点。', 'Rolled back to the selected backup.'],
    '找不到這個備份點。': ['找不到这个备份点。', 'Backup not found.'],
    '這個備份點只有檔案、沒有內嵌資料，請用「匯入備份檔」選擇對應檔案來還原。': [
        '这个备份点只有文件、没有内嵌数据，请用“导入备份文件”选择对应文件来还原。',
        'This backup is file-only. Use "Import backup" and pick the matching file.',
    ],
    '讀取備份檔失敗': ['读取备份文件失败', 'Failed to read the backup file'],
    '讀取備份檔失敗，詳情見控制台。': ['读取备份文件失败，详情见控制台。', 'Could not read the backup file (see the console).'],
    '無法解析這個檔案（支援本插件匯出的 .json 或 ST 的 .jsonl 聊天檔）。': [
        '无法解析这个文件（支持本插件导出的 .json 或 ST 的 .jsonl 聊天文件）。',
        'Unrecognised file (expected a .json exported by this plugin or an ST .jsonl chat file).',
    ],
    '從檔案匯入': ['从文件导入', 'Imported from file'],
    '目前沒有已載入的聊天，無法寫入。': ['目前没有已加载的聊天，无法写入。', 'No chat is loaded, so nothing can be written.'],
    '這個 ST 版本沒有提供 saveChat，無法寫回聊天檔案。': [
        '这个 ST 版本没有提供 saveChat，无法写回聊天文件。',
        'This SillyTavern version does not expose saveChat, so the chat file cannot be written.',
    ],
    '聊天內容在確認期間發生變化（換了聊天或收到新訊息），為安全起見已中止。請重新掃描。': [
        '聊天内容在确认期间发生变化（换了聊天或收到新消息），为安全起见已中止。请重新扫描。',
        'The chat changed while you were confirming (switched chat or new message). Aborted for safety — please scan again.',
    ],
    '一鍵清除前自動備份': ['一键清除前自动备份', 'Automatic backup before cleaning'],
    '寫入後重載聊天失敗，改為逐條刷新訊息區塊': [
        '写入后重载聊天失败，改为逐条刷新消息区块',
        'Reloading failed after writing; refreshing message blocks instead',
    ],
    '沒有需要清除的標籤。': ['没有需要清除的标签。', 'Nothing to remove.'],
    '沒有偵測到需要清除的標籤內容（或目前的標籤設定不會改動任何訊息）。': [
        '没有检测到需要清除的标签内容（或目前的标签设置不会改动任何消息）。',
        'No removable tag content was found (or the current settings would not change any message).',
    ],
    '再想想': ['再想想', 'Not now'],
    '已取消，未寫入任何內容。': ['已取消，未写入任何内容。', 'Cancelled — nothing was written.'],
    '已取消，聊天檔案沒有被改動。': ['已取消，聊天文件没有被改动。', 'Cancelled — the chat file was not modified.'],
    '是': ['是', 'Yes'],
    '否': ['否', 'No'],
    '掃描中…': ['扫描中…', 'Scanning…'],
    '正在掃描…': ['正在扫描…', 'Scanning…'],
    '寫入中…': ['写入中…', 'Writing…'],
    '發生錯誤，詳情見控制台。': ['发生错误，详情见控制台。', 'Something went wrong (see the console).'],
    '（整條清空）': ['（整条清空）', '(message cleared)'],
    '（無）': ['（无）', '(none)'],
    '（僅列出前 40 條，完整內容請看面板的「預覽」頁）': [
        '（仅列出前 40 条，完整内容请看面板的“预览”页）',
        '(first 40 only — see the Preview tab for everything)',
    ],
    '載入面板模板失敗': ['加载面板模板失败', 'Failed to load the panel template'],
    '載入面板模板失敗，請確認插件檔案完整（panel.html 是否存在）並重新整理頁面。': [
        '加载面板模板失败，请确认插件文件完整（panel.html 是否存在）并重新整理页面。',
        'Could not load the panel template. Check that panel.html exists, then refresh the page.',
    ],
    '面板模板內容不正確，載入中止。': ['面板模板内容不正确，加载中止。', 'The panel template looks wrong; loading aborted.'],
    '請先輸入要移除的內容。': ['请先输入要移除的内容。', 'Enter the text to remove first.'],
    '這個內容已經在清單裡了。': ['这个内容已经在列表里了。', 'That entry is already in the list.'],
    '外殼的左界與右界都要填。': ['外壳的左界与右界都要填。', 'Both sides are required.'],
    '左右界不能相同。': ['左右界不能相同。', 'The two sides must differ.'],
    '請先輸入標籤名。': ['请先输入标签名。', 'Enter a tag name first.'],
    '白名單已匯出成文字檔。': ['白名单已导出成文本文件。', 'Whitelist exported.'],
    '匯入白名單': ['导入白名单', 'Import whitelist'],
    '一行一個標籤名，貼上後按確認：': ['一行一个标签名，贴上后按确认：', 'One tag name per line:'],
    '匯入': ['导入', 'Import'],
    '手動備份': ['手动备份', 'Manual backup'],
    '已暫時關閉所有正則。': ['已暂时关闭所有正则。', 'All regex scripts paused.'],
    '已還原所有正則。': ['已还原所有正则。', 'All regex scripts restored.'],
    '恢復預設': ['恢复默认', 'Reset'],
    '已恢復出廠設定。': ['已恢复出厂设置。', 'Settings reset.'],
    '這一條訊息還在手動編輯中。要先保存再切換嗎？': [
        '这一条消息还在手动编辑中。要先保存再切换吗？',
        'This message is still being edited. Save before switching?',
    ],
    '保存並切換': ['保存并切换', 'Save and switch'],
    '知道了': ['知道了', 'Got it'],
    '目前沒有可回滾的備份點。': ['目前没有可回滚的备份点。', 'No backup available.'],
    '已建立備份點。': ['已创建备份点。', 'Backup created.'],
    '目前沒有可以編輯的訊息。': ['目前没有可以编辑的消息。', 'Nothing to edit.'],
    '開啟面板': ['开启面板', 'Open panel'],
    '一鍵清除…': ['一键清除…', 'Clean now…'],
    '掃描 → 確認 → 備份 → 清除': ['扫描 → 确认 → 备份 → 清除', 'Scan → confirm → backup → clean'],
    '建立備份點': ['创建备份点', 'Create backup'],
    '暫停正則': ['暂停正则', 'Pause regex'],
    '最近備份點': ['最近备份点', 'Recent backups'],
    '（還沒有備份點）': ['（还没有备份点）', '(no backups yet)'],
    '沒有正則': ['没有正则', 'no regex scripts'],
    '目前為暫停狀態': ['目前为暂停状态', 'paused'],
    '開啟或關閉面板': ['开启或关闭面板', 'Open or close the panel'],
    '面板已開啟。': ['面板已开启。', 'Panel opened.'],
    '面板已關閉。': ['面板已关闭。', 'Panel closed.'],
    '這個聊天檔案裡沒有偵測到任何 <> 標籤。': [
        '这个聊天文件里没有检测到任何 <> 标签。',
        'No <> tags were found in this chat file.',
    ],
    '已執行清除流程。': ['已执行清除流程。', 'Clean-up finished.'],
    '已執行回滾。': ['已执行回滚。', 'Rollback done.'],
    'true = 跳過確認直接寫入（仍然會自動備份）': [
        'true = 跳过确认直接写入（仍然会自动备份）',
        'true = skip the confirmation and write directly (a backup is still made)',
    ],
    '把聊天檔案裡所有 <code>&lt;think&gt;</code>、<code>&lt;summary&gt;</code> 之類的標籤內容直接刪掉，只留正文。有掃描預覽、白名單、二次確認與可回滾的備份點。': [
        '把聊天文件里所有 <code>&lt;think&gt;</code>、<code>&lt;summary&gt;</code> 之类的标签内容直接删掉，只留正文。有扫描预览、白名单、二次确认与可回滚的备份点。',
        'Delete everything inside <code>&lt;think&gt;</code>, <code>&lt;summary&gt;</code> and similar tags, keeping only the prose. Includes preview, whitelist, confirmation and rollback.',
    ],
    '掃描聊天檔案裡的 <> 標籤，一鍵清掉只留正文（含預覽、白名單、備份點）': [
        '扫描聊天文件里的 <> 标签，一键清掉只留正文（含预览、白名单、备份点）',
        'Scan the chat file for <> tags and remove them, keeping only the prose (preview, whitelist, backups included)',
    ],
    '掃描摘要': ['扫描摘要', 'Scan summary'],
    '執行結果': ['执行结果', 'Result'],
    '只掃描不改檔，回傳這個聊天裡偵測到的標籤統計。': [
        '只扫描不改文件，返回这个聊天里检测到的标签统计。',
        'Scan without writing, and return the tag statistics for this chat.',
    ],
    '直接走一次完整清除流程（會跳確認視窗）。': [
        '直接走一次完整清除流程（会跳确认窗口）。',
        'Run the full clean-up flow (the confirmation dialog still appears).',
    ],
    '回滾到上一個備份點。': ['回滚到上一个备份点。', 'Roll back to the previous backup.'],
    '開啟 / 關閉「一鍵去正則保正文」面板。': [
        '开启 / 关闭“一键去正则保正文”面板。',
        'Open or close the Tag Sweeper panel.',
    ],

    /* --- 標籤替換頁 ------------------------------------------------------- */
    '標籤替換': ['标签替换', 'Replace tags'],
    '目前沒有替換規則。': ['目前没有替换规则。', 'No replacement rules yet.'],
    '要換掉的文字，例如 <story>': ['要换掉的文字，例如 <story>', 'Text to replace, e.g. <story>'],
    '換成，例如 <content>': ['换成，例如 <content>', 'Replace with, e.g. <content>'],
    '新增替換': ['新增替换', 'Add rule'],
    '請先填入要換掉的文字。': ['请先填入要换掉的文字。', 'Enter the text to replace first.'],
    '要換掉的文字與換成的文字相同，不用替換。': [
        '要换掉的文字与换成的文字相同，不用替换。',
        'The source and the target are identical — nothing to replace.',
    ],
    '這個來源文字已經有替換規則了。': [
        '这个来源文字已经有替换规则了。',
        'A rule for this source text already exists.',
    ],
};

/* ========================================================================
 * 含動態內容的句子（{0} {1} 依序代入）
 * ===================================================================== */
export const PATTERNS = {
    '正則：{0}/{1} 啟用中': ['正则：{0}/{1} 启用中', 'Regex: {0}/{1} enabled'],
    '聊天：{0} ｜ 尚未掃描。': ['聊天：{0} ｜ 尚未扫描。', 'Chat: {0} ｜ not scanned yet.'],
    '掃描 <b>{0}</b> 條': ['扫描 <b>{0}</b> 条', 'Scanned <b>{0}</b>'],
    '有標籤 <b>{0}</b> 條': ['含标签 <b>{0}</b> 条', 'Tagged <b>{0}</b>'],
    '標籤種類 <b>{0}</b>': ['标签种类 <b>{0}</b>', 'Tag kinds <b>{0}</b>'],
    '將改寫 <b>{0}</b> 條': ['将改写 <b>{0}</b> 条', 'To rewrite <b>{0}</b>'],
    '刪除約 <b>{0}</b> 字': ['删除约 <b>{0}</b> 字', 'Removing ~<b>{0}</b> chars'],
    '白名單 <b>{0}</b>': ['白名单 <b>{0}</b>', 'Whitelist <b>{0}</b>'],
    '不理會 <b>{0}</b>': ['不理会 <b>{0}</b>', 'Leave <b>{0}</b>'],
    '殘留警告 {0} 條': ['残留警告 {0} 条', '{0} residue warning(s)'],
    '可能誤刪 {0} 條': ['可能误删 {0} 条', '{0} message(s) at risk'],
    '列表上的 {0} 個標籤都被你隱藏了。勾「顯示已隱藏」可以叫回來（它們仍然會照規則處理）。': [
        '列表上的 {0} 个标签都被你隐藏了。勾“显示已隐藏”可以叫回来（它们仍然会照规则处理）。',
        'All {0} listed tags are hidden. Tick "Show hidden" to bring them back (they are still processed).',
    ],
    '出現 {0}': ['出现 {0}', 'seen {0}'],
    '成對 {0}': ['成对 {0}', 'paired {0}'],
    '孤兒開 {0}': ['孤儿开 {0}', 'stray open {0}'],
    '孤兒閉 {0}': ['孤儿闭 {0}', 'stray close {0}'],
    '自閉合 {0}': ['自闭合 {0}', 'self-closing {0}'],
    '看這個標籤出現在哪幾條訊息（共 {0} 條）': [
        '看这个标签出现在哪几条消息（共 {0} 条）',
        'Where this tag appears ({0} messages)',
    ],
    '{0} 出現在 {1} 條訊息裡': ['{0} appears in {1} messages', '{0} appears in {1} messages'],
    '（只列出前 30 條）': ['（只列出前 30 条）', '(first 30 shown)'],
    ' —— 點訊息編號可以跳到那一條，跟編輯框對照。': [
        ' —— 点消息编号可以跳到那一条，跟编辑框对照。',
        ' — click a number to jump to that message.',
    ],
    '共 {0} 條訊息、刪除約 {1} 字': ['共 {0} 条消息、删除约 {1} 字', '{0} messages · ~{1} chars removed'],
    '刪除 {0} 字': ['删除 {0} 字', '{0} chars'],
    '另含 {0} 個 swipe': ['另含 {0} 个 swipe', '+{0} swipe(s)'],
    '命中 {0} 次 · 內容取捨看白名單': ['命中 {0} 次 · 内容取舍看白名单', '{0} hits · content is decided by the whitelist'],
    '{0} · 命中 {1} 次 · 刪 {2} 字': ['{0} · 命中 {1} 次 · 删 {2} 字', '{0} · {1} hits · {2} chars'],
    '{0} · 未命中': ['{0} · 未命中', '{0} · no match'],
    '命中 {0} 次 · 刪 {1} 字': ['命中 {0} 次 · 删 {1} 字', '{0} hits · {1} chars'],
    '不理會（原樣保留）：{0}': ['不理会（原样保留）：{0}', 'Left as is: {0}'],
    '掃描完成：{0} 條訊息需要改寫。': ['扫描完成：{0} 条消息需要改写。', 'Scan done: {0} message(s) to rewrite.'],
    '掃描完成：{0} 條訊息、{1} 種標籤、{2} 條需要改寫。': [
        '扫描完成：{0} 条消息、{1} 种标签、{2} 条需要改写。',
        'Scan done: {0} messages, {1} tag kinds, {2} to rewrite.',
    ],
    '確認清除（{0} 條）': ['确认清除（{0} 条）', 'Clean {0} message(s)'],
    '確認清除標籤內容': ['确认清除标签内容', 'Clear tagged content'],
    '回滾聊天檔案': ['回滚聊天档案', 'Roll back chat file'],
    '檢測到正文 {0} 可能被誤刪，是否仍然繼續清除？': [
        '检测到正文 {0} 可能被误删，是否仍然继续清除？',
        'Prose in {0} may be deleted. Continue anyway?',
    ],
    '完成！已清除 {0} 條訊息裡的標籤內容。備份點「{1}」可隨時回滾。': [
        '完成！已清除 {0} 条消息里的标签内容。备份点“{1}”可随时回滚。',
        'Done — cleaned {0} message(s). Backup "{1}" can be restored at any time.',
    ],
    '完成：已清除 {0} 條訊息。': ['完成：已清除 {0} 条消息。', 'Done — cleaned {0} message(s).'],
    '寫入校驗未通過：{0}/{1} 條訊息與預期不符。原檔案多半沒被改動，可用備份點回滾。': [
        '写入校验未通过：{0}/{1} 条消息与预期不符。原文件多半没被改动，可用备份点回滚。',
        'Verification failed: {0}/{1} messages do not match. The file is probably unchanged — roll back if needed.',
    ],
    '清除流程失敗：{0}': ['清除流程失败：{0}', 'Cleaning failed: {0}'],
    '已隱藏 {0} 個標籤（仍然會照規則消除，勾「顯示已隱藏」可以叫回來）。': [
        '已隐藏 {0} 个标签（仍然会照规则消除，勾“显示已隐藏”可以叫回来）。',
        'Hidden {0} tag(s). They are still removed — tick "Show hidden" to bring them back.',
    ],
    '已把 <{0}> 加入白名單（保留內容、只脫外殼）。': [
        '已把 <{0}> 加入白名单（保留内容、只脱外壳）。',
        'Added <{0}> to the whitelist (content kept, wrapper stripped).',
    ],
    '已加入外殼 {0}…{1}。': ['已加入外壳 {0}…{1}。', 'Added wrapper {0}…{1}.'],
    '{0}…{1} 已經在清單裡了。': ['{0}…{1} 已经在列表里了。', '{0}…{1} is already in the list.'],
    '已匯入 {0} 個白名單標籤。': ['已导入 {0} 个白名单标签。', 'Imported {0} whitelist tag(s).'],
    '已建立備份點：{0}': ['已创建备份点：{0}', 'Backup created: {0}'],
    '匯入：{0}': ['导入：{0}', 'Imported: {0}'],
    '從檔案匯入。': ['从文件导入。', 'Imported from a file.'],
    '已讀入 {0} 條訊息，接著確認是否回滾。': ['已读入 {0} 条消息，接着确认是否回滚。', 'Read {0} message(s); confirm the rollback next.'],
    '已匯出備份檔：{0}': ['已导出备份文件：{0}', 'Backup exported: {0}'],
    '聊天較大（{0}），備份已自動匯出成檔案；此備份點無法在面板內一鍵回滾。': [
        '聊天较大（{0}），备份已自动导出成文件；此备份点无法在面板内一键回滚。',
        'The chat is large ({0}), so the backup was exported to a file; it cannot be restored from the panel.',
    ],
    '找不到第 {0} 條訊息（可能還沒載入到畫面上）。': [
        '找不到第 {0} 条消息（可能还没加载到画面上）。',
        'Message #{0} was not found (it may not be rendered yet).',
    ],
    '第 #{0} 條：紅色是要刪掉的內容，可以直接修改或整段刪掉，好了按「保存」。': [
        '第 #{0} 条：红色是要删掉的内容，可以直接修改或整段删掉，好了按“保存”。',
        'Message #{0}: red text will be deleted — edit or remove it, then press Save.',
    ],
    '第 #{0} 條已套用手動編輯（還沒寫回聊天檔案，按「一鍵清除」才會生效）。': [
        '第 #{0} 条已套用手动编辑（还没写回聊天文件，按“一键清除”才会生效）。',
        'Message #{0} updated (not written to the chat file yet — press "Clean now" to apply).',
    ],
    '快捷鍵：<code>{0}</code>（可在面板「設定」頁修改）': [
        '快捷键：<code>{0}</code>（可在面板“设置”页修改）',
        'Hotkey: <code>{0}</code> (change it in the panel settings)',
    ],
    '快捷鍵 <code>{0}</code> 可以隨時開關這個面板（可在「設定」頁改）。': [
        '快捷键 <code>{0}</code> 可以随时开关这个面板（可在“设置”页改）。',
        'Hotkey <code>{0}</code> opens/closes this panel (change it in Settings).',
    ],
    '聊天：<b>{0}</b>（{1} 條訊息）': ['聊天：<b>{0}</b>（{1} 条消息）', 'Chat: <b>{0}</b> ({1} messages)'],
    '{0}×{1}({2})': ['{0}×{1}({2})', '{0}×{1} ({2})'],
    '掃描 {0} 條訊息，偵測到 {1} 種標籤：{2}。': [
        '扫描 {0} 条消息，检测到 {1} 种标签：{2}。',
        'Scanned {0} messages; found {1} tag kinds: {2}.',
    ],
    '目前設定會改寫 {0} 條訊息、刪除約 {1} 字。': [
        '目前设置会改写 {0} 条消息、删除约 {1} 字。',
        'Current settings would rewrite {0} messages and remove ~{1} chars.',
    ],
    '已替換 {0} 處': ['已替换 {0} 处', 'Replaced {0}×'],
    '替換 {0} 處': ['替换 {0} 处', 'Replaced {0}×'],
    '替換 <b>{0}</b> 處': ['替换 <b>{0}</b> 处', 'Replaced <b>{0}</b>'],
    '已加入替換：{0} → {1}。': ['已加入替换：{0} → {1}。', 'Replacement added: {0} → {1}.'],
    '已加入替換：{0} →（刪除）。': ['已加入替换：{0} →（删除）。', 'Replacement added: {0} → (delete).'],
    '有 {0} 條訊息出現「孤兒標籤前面還有殘留」：插件不確定那段該不該刪，所以保留了。請先到「預覽」頁切到「消除前」確認；若確實是垃圾，把設定改成「一律從訊息開頭砍」再清一次。': [
        '有 {0} 条消息出现“孤儿标签前面还有残留”：插件不确定那段该不该删，所以保留了。请先到“预览”页切到“消除前”确认；若确实是垃圾，把设置改成“一律从消息开头砍”再清一次。',
        '{0} message(s) still have text before a stray tag. It was kept because it may be prose — check the Preview tab first, and switch the stray-tag setting to "always from the start" if it really is junk.',
    ],
};

/* ========================================================================
 * 面板裡以 HTML 呈現的說明區塊（用 data-i18n-html 指定 key）
 * ===================================================================== */
export const HTML_BLOCKS = {
    'hint.tags': {
        hans: '<b class="ts-red">红框＝消除</b>（连同里面的内容一起删掉）；<b class="ts-green">绿框＝白名单</b>（保留内容，只脱掉外壳）；都不勾＝原样保留。<br>标签太多时，先输入关键字筛选，再按“隐藏列出的”收起来。点列首的 <b>▸</b> 可以看它出现在哪些消息。',
        en: '<b class="ts-red">Red box = remove</b> (delete the content too); <b class="ts-green">Green box = whitelist</b> (keep the content, strip only the wrapper); neither = leave it as is.<br>Too many tags? Filter by keyword, then press "Hide listed". Press <b>▸</b> to see which messages a tag comes from.',
    },
    'hint.shells': {
        hans: '<b>外壳</b>＝包住内容的左右符号。“整段消除”会连内容一起删掉，“只脱壳”只拆掉符号、留下内容。右界前的 <code>/</code> 可以选择要不要，例如 <code>&lt;/think&gt;</code> 需要、<code>{}</code> 通常不需要。',
        en: '<b>Wrappers</b> are the delimiters around a block. "Remove whole" deletes the content too; "Unwrap only" keeps it and drops just the delimiters. The <code>/</code> before the closing side is optional — needed for <code>&lt;/think&gt;</code>, usually not for <code>{}</code>.',
    },
    'hint.literals': {
        hans: '指定的内容只要原样出现就移除，常用于清除被写进正文的代码围栏标记。',
        en: 'Any exact match is removed — handy for stray code-fence markers written into the prose.',
    },
    'hint.replace': {
        hans: '<b>标签替换</b>＝先把指定的文字改成别的名字，再照“标签处理 / 外壳”的规则清理。例如把 <code>&lt;story&gt;</code> 改成 <code>&lt;content&gt;</code>，正文就会跟着 <code>content</code> 的白名单设置走；<code>&lt;story&gt;</code> 这种写法会顺便连结尾的 <code>&lt;/story&gt;</code> 一起换。<br>替换是纯文字比对，<code>[a]</code> → <code>[b]</code> 也可以。改名的结果会反映在“预览”页。',
        en: '<b>Tag replacement</b> renames text before the sweep runs, so the new names follow the "Tags" and "Wrappers" rules. Rewriting <code>&lt;story&gt;</code> to <code>&lt;content&gt;</code> makes the prose follow the <code>content</code> whitelist; writing <code>&lt;story&gt;</code> also rewrites the closing <code>&lt;/story&gt;</code>.<br>It is a plain text match, so <code>[a]</code> → <code>[b]</code> works too. Results show up on the "Preview" tab.',
    },
    'hint.whitelist': {
        hans: '白名单＝<b>保留内容、只脱外壳</b>。加入 <code>plot</code> 之后，<code>&lt;plot&gt;正文&lt;/plot&gt;</code> 会变成“正文”。<br>想保留 <code>&lt;!-- 这段 --&gt;</code> 的内容，请加入 <code>!--</code>（代表所有 HTML 注释）。',
        en: 'Whitelist = <b>keep the content, strip the wrapper</b>. With <code>plot</code> added, <code>&lt;plot&gt;正文&lt;/plot&gt;</code> becomes just the text.<br>To keep the inside of <code>&lt;!-- … --&gt;</code>, add <code>!--</code> (covers every HTML comment).',
    },
    'hint.regex': {
        hans: '插件读的是聊天文件的原始内容，正则开着或关着都不影响结果。<br>这颗按钮只是暂时停用所有正则，方便用肉眼对照原文，再按一次还原。',
        en: 'The plugin reads the raw chat data, so regex scripts (on or off) do not change the result.<br>This button only pauses them temporarily so you can compare by eye; press again to restore.',
    },
    'hint.hotkey': {
        hans: '默认 <code>Ctrl+Alt+X</code>。点输入框后直接按你要的组合键即可。',
        en: 'Default is <code>Ctrl+Alt+X</code>. Click the field, then press the combination you want.',
    },
    'hint.backups': {
        hans: '每次写入前都会自动创建备份点；回滚前也会先备份当前状态，所以回滚本身也能反悔。',
        en: 'A backup is created before every write; rolling back also backs up the current state first, so the rollback itself can be undone.',
    },
};

/* ========================================================================
 * 引擎
 * ===================================================================== */
export function normalizeLocale(value) {
    return LOCALES.includes(value) ? value : 'auto';
}

function pick(entry, locale) {
    if (locale === 'zh-Hans') return entry[0];
    if (locale === 'en') return entry[1];
    return null;
}

/** 把 {0} {1} 代入 */
function fill(text, args) {
    let out = text;
    args.forEach((value, index) => {
        out = out.split(`{${index}}`).join(String(value));
    });
    return out;
}

function escapeRegExp(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const compiled = new Map();

function patternsFor(locale) {
    if (compiled.has(locale)) return compiled.get(locale);
    const list = Object.entries(PATTERNS).map(([key, entry]) => {
        const source = key
            .split(/(\{\d\})/)
            .map(part => (/^\{\d\}$/.test(part) ? '([\\s\\S]*?)' : escapeRegExp(part)))
            .join('');
        return { re: new RegExp(`^${source}$`), key, entry };
    });
    compiled.set(locale, list);
    return list;
}

const plainCompiled = new Map();

/**
 * 同一批句型，但把 <b> </b> 這類標記剝掉。
 * 有些地方（例如 <span> 的 textContent）拿到的是一整段純文字，
 * 句型原文卻帶標記，剝掉之後才對得上。
 */
function plainPatternsFor(locale) {
    if (plainCompiled.has(locale)) return plainCompiled.get(locale);
    const strip = text => String(text).replace(/<[^>]+>/g, '');
    const list = Object.entries(PATTERNS).map(([key, entry]) => {
        const plainKey = strip(key);
        if (!/\{\d\}/.test(plainKey)) return null;
        const source = plainKey
            .split(/(\{\d\})/)
            .map(part => (/^\{\d\}$/.test(part) ? '([\\s\\S]*?)' : escapeRegExp(part)))
            .join('');
        return {
            re: new RegExp(source),
            entry: [strip(entry[0]), strip(entry[1])],
        };
    }).filter(Boolean);
    plainCompiled.set(locale, list);
    return list;
}

/** 翻譯一整段文字（會先試完全相符，再試含數字的句型） */
export function localizeText(text, locale) {
    if (locale === 'zh-Hant' || typeof text !== 'string' || !text) return text;
    const trimmed = text.trim();
    if (!trimmed) return text;

    const exact = TABLE[trimmed];
    if (exact) {
        const replaced = pick(exact, locale) ?? trimmed;
        const start = text.indexOf(trimmed);
        return text.slice(0, start) + replaced + text.slice(start + trimmed.length);
    }

    for (const item of patternsFor(locale)) {
        const match = item.re.exec(trimmed);
        if (!match) continue;
        const target = pick(item.entry, locale);
        if (!target) continue;
        const replaced = fill(target, match.slice(1));
        const start = text.indexOf(trimmed);
        return text.slice(0, start) + replaced + text.slice(start + trimmed.length);
    }

    for (const item of plainPatternsFor(locale)) {
        const match = item.re.exec(trimmed);
        if (!match) continue;
        const target = pick(item.entry, locale);
        if (!target) continue;
        const replaced = fill(target, match.slice(1));
        const start = text.indexOf(trimmed);
        return text.slice(0, start) + replaced + text.slice(start + trimmed.length);
    }

    return text;
}

/** JS 產生字串時直接翻：tr('將改寫 {0} 條', [n]) */
export function makeTranslator(locale) {
    return function tr(key, args) {
        if (locale === 'zh-Hant') {
            return args ? fill(key, args) : key;
        }
        const exact = TABLE[key];
        if (exact) {
            const target = pick(exact, locale) ?? key;
            return args ? fill(target, args) : target;
        }
        const pattern = PATTERNS[key];
        if (pattern) {
            const target = pick(pattern, locale) ?? key;
            return args ? fill(target, args) : target;
        }
        return args ? fill(key, args) : key;
    };
}

const htmlCompiled = new Map();

function htmlPatternsFor(locale) {
    if (htmlCompiled.has(locale)) return htmlCompiled.get(locale);
    const list = Object.entries(PATTERNS).map(([key, entry]) => {
        const source = key
            .split(/(\{\d\})/)
            .map(part => (/^\{\d\}$/.test(part) ? '([\\s\\S]*?)' : escapeRegExp(part)))
            .join('');
        return { re: new RegExp(source, 'g'), entry };
    });
    htmlCompiled.set(locale, list);
    return list;
}

/**
 * 翻譯一整段「含標籤的 HTML 字串」（給 renderSummary / 彈窗這種自己組字串的地方用）。
 * 只比對 PATTERNS（句型裡本來就有 <b> 之類的標記），不會去動使用者內容；
 * 整段剛好等於某個固定字串時，才套 TABLE。
 */
export function localizeHtml(html, locale) {
    if (locale === 'zh-Hant' || typeof html !== 'string' || !html) return html;

    const exact = TABLE[html.trim()];
    if (exact) {
        const target = pick(exact, locale);
        if (target) return target;
    }

    let out = html;
    for (const item of htmlPatternsFor(locale)) {
        const target = pick(item.entry, locale);
        if (!target) continue;
        out = out.replace(item.re, (...args) => {
            const groups = args.slice(1, 1 + (args.length - 3));
            return fill(target, groups);
        });
    }
    return out;
}

export function translateHtmlBlock(key, locale) {
    const block = HTML_BLOCKS[key];
    if (!block) return null;
    if (locale === 'zh-Hans') return block.hans;
    if (locale === 'en') return block.en;
    return null;
}

/** 酒館介面語言（猜不到就當繁體） */
export function detectLocale(ctx) {
    const candidates = [];
    try { candidates.push(ctx?.getCurrentLocale?.()); } catch { /* 忽略 */ }
    try { candidates.push(typeof document !== 'undefined' ? document.documentElement?.lang : ''); } catch { /* 忽略 */ }
    try { if (typeof navigator !== 'undefined') candidates.push(navigator.language); } catch { /* 忽略 */ }

    for (const raw of candidates) {
        const value = String(raw || '').toLowerCase();
        if (!value) continue;
        if (value.startsWith('zh')) return /tw|hk|hant|mo/.test(value) ? 'zh-Hant' : 'zh-Hans';
        if (value.startsWith('en')) return 'en';
    }
    return 'zh-Hant';
}

export function resolveLocale(setting, ctx) {
    const wanted = normalizeLocale(setting);
    return wanted === 'auto' ? detectLocale(ctx) : wanted;
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'CODE']);
const ATTRS = ['title', 'placeholder', 'aria-label'];

/** 翻譯面板中的 DOM：文字節點 + title/placeholder/aria-label，跳過使用者內容與程式碼 */
export function localizeTree(root, locale) {
    if (!root || locale === 'zh-Hant') return;
    const doc = root.ownerDocument || (typeof document !== 'undefined' ? document : null);
    if (!doc) return;

    for (const element of root.querySelectorAll('[data-i18n-html]')) {
        const html = translateHtmlBlock(element.dataset.i18nHtml, locale);
        if (html) element.innerHTML = html;
    }

    if (typeof doc.createTreeWalker === 'function') {
        const walker = doc.createTreeWalker(root, 4 /* SHOW_TEXT */, {
            acceptNode(node) {
                const parent = node.parentElement;
                if (!parent) return 2;
                if (SKIP_TAGS.has(parent.tagName)) return 2;
                if (parent.isContentEditable) return 2;
                if (parent.closest('[data-no-i18n]')) return 2;
                if (!node.nodeValue || !node.nodeValue.trim()) return 2;
                return 1;
            },
        });
        const nodes = [];
        let current = walker.nextNode();
        while (current) {
            nodes.push(current);
            current = walker.nextNode();
        }
        for (const node of nodes) {
            const next = localizeText(node.nodeValue, locale);
            if (next !== node.nodeValue) node.nodeValue = next;
        }
    }

    for (const element of root.querySelectorAll(ATTRS.map(attr => `[${attr}]`).join(','))) {
        if (element.closest('[data-no-i18n]')) continue;
        for (const attr of ATTRS) {
            const value = element.getAttribute(attr);
            if (!value) continue;
            const next = localizeText(value, locale);
            if (next !== value) element.setAttribute(attr, next);
        }
    }
}

/** 給測試與除錯用 */
export const __TABLES = { TABLE, PATTERNS, HTML_BLOCKS };
