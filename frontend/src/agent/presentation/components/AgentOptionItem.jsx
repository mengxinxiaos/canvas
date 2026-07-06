import React from 'react';
import { agentUi, cx } from './agentUiClassNames';

export default function AgentOptionItem({
    icon,
    title,
    subtitle,
    meta,
    active = false,
    disabled = false,
    className,
    iconClassName,
    onClick,
    onMouseEnter,
    rightSlot,
    children,
}) {
    const Icon = icon;

    return (
        <button
            type="button"
            disabled={disabled}
            onMouseEnter={onMouseEnter}
            onClick={onClick}
            className={cx(
                agentUi.menuItem,
                active && agentUi.menuItemActive,
                disabled && agentUi.menuItemDisabled,
                className,
            )}
        >
            {Icon && (
                <div className={cx(agentUi.skillIconBox, iconClassName)}>
                    <Icon size={15} />
                </div>
            )}

            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                    <div className="text-sm font-medium text-neutral-100 truncate">
                        {title}
                    </div>

                    {meta && (
                        <div className="text-[10px] text-neutral-500 truncate">
                            {meta}
                        </div>
                    )}
                </div>

                {subtitle && (
                    <div className="text-[11px] text-neutral-500 truncate">
                        {subtitle}
                    </div>
                )}

                {children}
            </div>

            {rightSlot}
        </button>
    );
}