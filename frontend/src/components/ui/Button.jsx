export const Button = ({ children, variant = "primary", className = "", ...props }) => {
    const baseStyles = "px-4 py-2 rounded-lg text-[11px] font-black uppercase tracking-wide transition-all active:scale-95 shrink-0 flex items-center justify-center gap-2 disabled:opacity-50";

    const variants = {
        primary: "bg-brand-500 text-black hover:bg-brand-400 shadow-lg shadow-brand-500/20",
        danger: "bg-danger/10 text-danger border border-danger/20 hover:bg-danger hover:text-white",
        warning: "bg-warning/10 text-warning border border-warning/20 hover:bg-warning hover:text-black",
        ghost: "text-content-subtle dark:text-white/30 hover:bg-surface-2 dark:hover:bg-white/5"
    };

    return (
        <button className={`${baseStyles} ${variants[variant]} ${className}`} {...props}>
            {children}
        </button>
    );
};