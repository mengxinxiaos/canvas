export async function consumeSSEStream(response, handlers = {}) {
    if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
    }

    if (!response.body) {
        throw new Error('当前浏览器不支持 ReadableStream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');

    let buffer = '';

    const flushEvent = (rawEvent) => {
        const lines = rawEvent.split('\n');

        let eventName = 'message';
        const dataLines = [];

        for (const line of lines) {
            if (line.startsWith('event:')) {
                eventName = line.slice(6).trim();
            } else if (line.startsWith('data:')) {
                dataLines.push(line.slice(5).trimStart());
            }
        }

        const dataText = dataLines.join('\n');
        const data = dataText ? JSON.parse(dataText) : {};

        if (eventName === 'delta') {
            handlers.onDelta?.(data);
        } else if (eventName === 'final') {
            handlers.onFinal?.(data);
        } else if (eventName === 'error') {
            handlers.onError?.(data);
        } else if (eventName === 'done') {
            handlers.onDone?.(data);
        } else {
            handlers.onEvent?.(eventName, data);
        }
    };

    while (true) {
        const { value, done } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        let index;
        while ((index = buffer.indexOf('\n\n')) !== -1) {
            const rawEvent = buffer.slice(0, index).trim();
            buffer = buffer.slice(index + 2);

            if (rawEvent) {
                flushEvent(rawEvent);
            }
        }
    }

    if (buffer.trim()) {
        flushEvent(buffer.trim());
    }
}