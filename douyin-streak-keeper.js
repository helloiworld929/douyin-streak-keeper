// ============================================================
// 抖音火花助手 v8
// 支持桌面版 Google Chrome、Microsoft Edge 和 Mozilla Firefox
// ============================================================

// ============================================================
// 第一部分：工具函数
// ============================================================

function detectBrowser() {
    const userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    if (userAgent.includes('Edg')) return 'edge';
    if (userAgent.includes('Firefox')) return 'firefox';
    if (userAgent.includes('Chrome')) return 'chrome';
    return 'other';
}

function usesEdgeOrFirefoxCompatibility() {
    const browser = detectBrowser();
    return browser === 'edge' || browser === 'firefox';
}

// 1. 获取滚动容器
function getScrollContainer() {
    if (!usesEdgeOrFirefoxCompatibility()) {
        const container = document.querySelector('.conversationConversationListwrapper');
        if (container) return container;
        return document.querySelector('[class*="conversationListwrapper"]') || document.documentElement;
    }

    const selectors = [
        '.ZPZWu08A',
        '[class*="scroll"]',
        '.conversationConversationListwrapper',
        '[class*="conversationList"]',
        '[class*="list-wrapper"]'
    ];
    for (const selector of selectors) {
        const container = document.querySelector(selector);
        if (container && container.scrollHeight > container.clientHeight) return container;
    }
    return document.documentElement;
}

// 2. 模拟真实点击
function simulateRealClick(element) {
    if (!element) return false;
    
    const rect = element.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    
    const events = [
        { type: 'pointerdown', button: 0 },
        { type: 'mousedown', button: 0 },
        { type: 'pointerup', button: 0 },
        { type: 'mouseup', button: 0 },
        { type: 'click', button: 0 }
    ];
    
    events.forEach(eventData => {
        const event = new MouseEvent(eventData.type, {
            view: window,
            bubbles: true,
            cancelable: true,
            button: eventData.button,
            clientX: x,
            clientY: y,
            detail: 1
        });
        element.dispatchEvent(event);
    });
    
    return true;
}

// 3. 查找可点击元素
function findClickableElement(chatItem) {
    const selectors = usesEdgeOrFirefoxCompatibility()
        ? [
            '.lxkX4zbN',
            '.RlYyXQPf',
            'a[href*="/user/"]',
            '.conversationConversationItemrowArea1',
            '.conversationConversationItemrowArea2',
            '.conversationConversationItemtitleWrapper'
        ]
        : [
            'a[href*="/user/"]',
            '.conversationConversationItemrowArea1',
            '.conversationConversationItemrowArea2',
            '.conversationConversationItemtitleWrapper'
        ];
    
    for (const selector of selectors) {
        const el = chatItem.querySelector(selector);
        if (el) return el;
    }
    return chatItem;
}

// 4. 延迟等待
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function extractUserName(item) {
    if (!usesEdgeOrFirefoxCompatibility()) {
        const title = item.querySelector('.conversationConversationItemtitle');
        return title ? title.textContent.trim() : '';
    }

    const selectors = [
        '.id9S7XEC',
        '.conversationConversationItemtitle',
        '[class*="title"]',
        '[class*="name"]'
    ];
    for (const selector of selectors) {
        const title = item.querySelector(selector);
        const name = title?.textContent?.trim() || '';
        if (name && !name.includes('[续火花]') && !name.includes('重燃中')) {
            return name;
        }
    }
    return '';
}

function extractStreakInfo(item) {
    if (!usesEdgeOrFirefoxCompatibility()) {
        const image = item.querySelector('.commonStreakstreakContainer img');
        let days = 0;
        let isGray = false;

        if (image) {
            isGray = (image.src || '').includes('gray');
            const streakContainer = image.closest('.commonStreakstreakContainer');
            const text = streakContainer?.textContent || '';
            const daysMatch = text.match(/\d+/);
            days = daysMatch ? parseInt(daysMatch[0], 10) : 0;
        }
        return { days, isGray };
    }

    const streakContainer = item.querySelector('.XOxNFujI');
    if (!streakContainer) return { days: 0, isGray: false };

    const image = streakContainer.querySelector('img');
    let isGray = Boolean(image?.src?.includes('disable'));
    const dayElement = streakContainer.querySelector('.FtNMpRzZ');
    let days = 0;

    if (dayElement) {
        const text = dayElement.textContent.trim();
        if (text.includes('重燃')) {
            isGray = true;
        } else {
            const daysMatch = text.match(/\d+/);
            days = daysMatch ? parseInt(daysMatch[0], 10) : 0;
        }
    }

    if (days === 0 && !isGray) {
        const daysMatch = streakContainer.textContent.trim().match(/\d+/);
        days = daysMatch ? parseInt(daysMatch[0], 10) : 0;
    }

    return { days, isGray };
}

// ============================================================
// 第二部分：核心功能 - 扫描
// ============================================================

// 5. 智能加载 - 发现所有灰色火花后停止
async function loadChatsUntilNoNewGray() {
    console.log('正在扫描火花会话...');
    
    const container = getScrollContainer();
    const allChats = [];
    const seenNames = new Set();
    let noNewGrayCount = 0;
    let totalScrolls = 0;
    let totalGrayFound = 0;
    let hasFoundAnyStreak = false;
    const usesCompatibility = usesEdgeOrFirefoxCompatibility();
    const maxNoNewGray = 3;   // 连续3次没有新灰色就停止
    const maxScrolls = 30;    // 最多滚动30次防止死循环
    
    // 先滚到顶部
    container.scrollTop = 0;
    await sleep(500);
    
    while (totalScrolls < maxScrolls) {
        totalScrolls++;
        let foundNewGray = false;
        let newChatsCount = 0;
        
        // 收集当前可见的会话
        const items = document.querySelectorAll('[data-e2e="conversation-item"]');
        
        for (const item of items) {
            const userName = extractUserName(item);
            if (!userName) continue;
            
            // 去重
            if (seenNames.has(userName)) continue;
            seenNames.add(userName);
            newChatsCount++;
            
            // Chrome 保留原判断；Edge/Firefox 额外识别“重燃中”状态。
            const { days, isGray } = extractStreakInfo(item);
            const isStreak = usesCompatibility ? days > 0 || isGray : days > 0;
            if (isStreak) {
                hasFoundAnyStreak = true;
                if (isGray) {
                    foundNewGray = true;
                    totalGrayFound++;
                }
                allChats.push({
                    userName: userName,
                    days: days,
                    isGray: isGray,
                    needRenew: isGray
                });
                
            }
        }
        
        // 判断是否继续滚动
        if (!hasFoundAnyStreak) {
            noNewGrayCount = 0;
            console.log('进度  尚未发现火花 · 继续扫描');
        } else {
            if (foundNewGray) {
                noNewGrayCount = 0;
                console.log(`进度  新会话 ${newChatsCount} · 待续累计 ${totalGrayFound}`);
            } else {
                noNewGrayCount++;
                console.log(`进度  未发现新待续会话 · ${noNewGrayCount}/${maxNoNewGray}`);
            }
        }
        
        // 检查是否应该停止
        if (hasFoundAnyStreak && noNewGrayCount >= maxNoNewGray) {
            console.log(`连续 ${maxNoNewGray} 轮无新增，提前结束扫描。`);
            break;
        }
        
        // 滚动 - 每次 200-300px
        const currentScroll = container.scrollTop;
        const maxScroll = container.scrollHeight - container.clientHeight;
        const remaining = maxScroll - currentScroll;
        
        if (remaining < 50) {
            console.log('已到达会话列表底部。');
            break;
        }
        
        const step = 200 + Math.random() * 100;
        const targetScroll = Math.min(currentScroll + step, maxScroll);
        container.scrollTop = targetScroll;
        
        await sleep(600 + Math.random() * 300);
    }
    
    console.log(
        `扫描完成  会话 ${allChats.length} · ` +
        `待续 ${allChats.filter(c => c.isGray).length} · ` +
        `正常 ${allChats.filter(c => c.days > 0 && !c.isGray).length}`
    );
    
    return allChats;
}

// 6. 扫描灰色火花（主入口）
async function findGrayStreakFriends() {
    const allChats = await loadChatsUntilNoNewGray();
    const friends = allChats.filter(chat => chat.days > 0 || chat.isGray);
    return friends;
}

// 7. 显示结果
function displayFriends(friends) {
    const needRenew = friends.filter(f => f.needRenew);
    const noNeed = friends.filter(f => !f.needRenew);
    
    console.log(`\n待续 · ${needRenew.length}`);
    if (needRenew.length > 0) {
        needRenew.forEach((f, i) => {
            const daysText = f.days > 0 ? `${f.days} 天` : '重燃中';
            console.log(`  ${String(i+1).padStart(2, '0')}  ${f.userName} · ${daysText}`);
        });
    } else {
        console.log('  暂无');
    }
    
    console.log(`\n正常 · ${noNeed.length}`);
    if (noNeed.length > 0) {
        noNeed.forEach((f, i) => {
            console.log(`  ${String(i+1).padStart(2, '0')}  ${f.userName} · ${f.days} 天`);
        });
    }
    
    window.__needRenew = needRenew;
    return { needRenew, noNeed };
}

// ============================================================
// 第三部分：核心功能 - 切换和发送
// ============================================================

// 8. 切换到用户
async function switchToUser(userName) {
    console.log(`正在打开  ${userName}`);
    
    const container = getScrollContainer();
    container.scrollTop = 0;
    await sleep(300);
    
    let targetItem = null;
    let targetName = '';
    let attempts = 0;
    const maxAttempts = 20;
    
    while (!targetItem && attempts < maxAttempts) {
        attempts++;
        
        const items = document.querySelectorAll('[data-e2e="conversation-item"]');
        for (const item of items) {
            const name = extractUserName(item);
            if (name === userName) {
                targetItem = item;
                targetName = name;
                break;
            }
        }
        
        if (!targetItem) {
            const currentScroll = container.scrollTop;
            const step = 150 + Math.random() * 100;
            container.scrollTop = currentScroll + step;
            await sleep(400);
        }
    }
    
    if (!targetItem) {
        console.error(`未找到会话：${userName}`);
        return false;
    }
    
    if (
        targetItem.classList.contains('conversationConversationItemcurConversation') ||
        targetItem.classList.contains('iwnJ4cJC')
    ) {
        console.log(`当前会话  ${targetName}`);
        return true;
    }
    
    targetItem.scrollIntoView({ block: 'center' });
    await sleep(500);
    
    const clickable = findClickableElement(targetItem);
    simulateRealClick(clickable);
    await sleep(1500);
    
    console.log(`已打开  ${targetName}`);
    return true;
}

// 9. Edge/Firefox 发送消息
async function sendMessageForOtherBrowsers(message) {
    const input = document.querySelector('.public-DraftEditor-content[contenteditable="true"]');
    if (!input) {
        console.error('未找到消息输入框。');
        return false;
    }
    await sleep(200);
    input.focus();
    input.click();
    await sleep(200);

    input.innerHTML = '';
    const block = document.createElement('div');
    block.setAttribute('data-block', 'true');
    block.setAttribute('data-editor', 'send-editor');
    block.setAttribute('data-offset-key', 'foo-0-0');

    const content = document.createElement('div');
    content.setAttribute('data-offset-key', 'foo-0-0');
    content.className = 'public-DraftStyleDefault-block public-DraftStyleDefault-ltr';

    const span = document.createElement('span');
    span.setAttribute('data-offset-key', 'foo-0-0');
    const text = document.createElement('span');
    text.setAttribute('data-text', 'true');
    text.textContent = message;

    span.appendChild(text);
    content.appendChild(span);
    block.appendChild(content);
    input.appendChild(block);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await sleep(300);

    const sendButton = document.querySelector('.e2e-send-msg-btn') ||
        document.querySelector('[class*="send-msg-btn"]') ||
        document.querySelector('.send-btn, [type="submit"], button[aria-label*="发送"]');

    if (sendButton && sendButton.offsetParent !== null) {
        sendButton.click();
    } else {
        input.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        }));
    }

    return true;
}

// 10. Chrome 发送消息
async function sendMessageForChrome(message) {
    const input = document.querySelector('[data-slate-editor="true"]');
    if (!input) {
        console.error('未找到消息输入框。');
        return false;
    }

    input.focus();
    input.click();
    await sleep(200);

    document.execCommand('selectAll', false, null);
    document.execCommand('delete', false, null);
    await sleep(100);

    document.execCommand('insertText', false, message);
    await sleep(300);

    const sendButton = document.querySelector('.e2e-send-msg-btn') ||
        document.querySelector('[class*="send-msg-btn"]') ||
        document.querySelector('.send-btn, [type="submit"], button[aria-label*="发送"]');

    if (sendButton && sendButton.offsetParent !== null) {
        const rect = sendButton.getBoundingClientRect();
        const eventOptions = {
            view: window,
            bubbles: true,
            cancelable: true,
            clientX: rect.left + rect.width / 2,
            clientY: rect.top + rect.height / 2
        };
        for (const type of ['pointerdown', 'mousedown', 'mouseup', 'click']) {
            sendButton.dispatchEvent(new MouseEvent(type, eventOptions));
        }
    } else {
        const eventOptions = {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true,
            composed: true
        };
        for (const type of ['keydown', 'keypress', 'keyup']) {
            input.dispatchEvent(new KeyboardEvent(type, eventOptions));
        }
        input.dispatchEvent(new Event('input', { bubbles: true }));
    }

    return true;
}

function sendMessage(message) {
    if (usesEdgeOrFirefoxCompatibility()) {
        return sendMessageForOtherBrowsers(message);
    }
    return sendMessageForChrome(message);
}

// 11. 批量发送
async function batchSendToGray(message = '🔥') {
    if (!window.__needRenew || window.__needRenew.length === 0) {
        console.log('没有需要续火的会话。');
        return;
    }
    
    const needRenew = window.__needRenew;
    console.log(`\n准备发送  ${needRenew.length} 人 · "${message}"`);
    
    let successCount = 0;
    
    for (let i = 0; i < needRenew.length; i++) {
        const friend = needRenew[i];
        const daysText = friend.days > 0 ? `${friend.days} 天` : '重燃中';
        console.log(`\n[${i+1}/${needRenew.length}] ${friend.userName} · ${daysText}`);
        
        const switched = await switchToUser(friend.userName);
        if (!switched) {
            console.log(`已跳过  ${friend.userName}`);
            continue;
        }
        
        await sleep(1000);
        await sendMessage(message);
        successCount++;
        console.log(`已发送  ${friend.userName}`);
        
        await sleep(1500);
    }
    
    console.log(`\n发送完成  ${successCount}/${needRenew.length}`);
}

// ============================================================
// 第四部分：主入口
// ============================================================

// 12. 一键自动续火
async function autoRenew(message = '🔥') {
    console.clear();
    console.log('抖音火花助手 v8\n');
    
    // 智能扫描
    const friends = await findGrayStreakFriends();
    const result = displayFriends(friends);
    
    if (result.needRenew.length === 0) {
        console.log('\n当前没有需要续火的会话。');
        return;
    }
    
    // 发送前等待
    console.log('\n3 秒后开始发送。');
    await sleep(3000);
    
    // 批量发送
    await batchSendToGray(message);
}

// 13. 快速查看所有火花
async function listAllChats() {
    console.clear();
    console.log('抖音火花助手 v8 · 火花列表\n');
    
    const friends = await findGrayStreakFriends();
    
    console.log(`\n全部会话 · ${friends.length}`);
    if (friends.length === 0) {
        console.log('  暂无');
    } else {
        friends.forEach((f, i) => {
            const status = f.isGray ? '待续' : '正常';
            const daysText = f.days > 0 ? `${f.days} 天` : '重燃中';
            console.log(`  ${String(i+1).padStart(2, '0')}  ${status}  ${f.userName} · ${daysText}`);
        });
    }
}

// ============================================================
// 第五部分：使用说明
// ============================================================

console.clear();
console.log(`
抖音火花助手 v8

  查看火花
  await listAllChats()

  自动续火
  await autoRenew()

  自定义消息
  await autoRenew('🔥 今天也要加油哦！')
`);
