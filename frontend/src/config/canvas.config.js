// config/canvas.config.js

export const CANVAS_CONFIG = {
    // 1. 排版引擎参数 (对应 onLayoutGroup)
    LAYOUT: {
        GRID: {
            PADDING_X: 60,
            PADDING_TOP: 80,
            PADDING_BOTTOM: 60,
            GAP_X: 40,
            GAP_Y: 40
        },
        HORIZONTAL: {
            GAP_X: 200, // 水平拓扑连线需要更大的横向空间
            GAP_Y: 40
        }
    },
    
    // 2. 节点与缩放限制 (对应 resize 和 createNode)
    NODE: {
        LIMITS: {
            MAX_DIMENSION: 2560,
            MIN_WIDTH: 100,
            MIN_HEIGHT_FREE: 40,
            MIN_GROUP_WIDTH: 200,
            MIN_GROUP_HEIGHT: 200
        },
        TEXT: {
            MIN_FONT_SIZE: 12,
            MAX_FONT_SIZE: 400
        }
    },

    // 3. 视口与交互 (对应双击聚焦动画)
    VIEWPORT: {
        ANIMATION: {
            DURATION: 350,
            EASE_POWER: -10 // easeOutExpo 的幂次
        },
        FOCUS: {
            PADDING_RATIO: 0.8,
            MAX_ZOOM: 2.5
        }
    },

    // 4. 连线参数
    EDGE: {
        MIN_CTRL_OFFSET: 50,
        CTRL_RATIO: 0.4
    }
};