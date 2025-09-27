export type WorkTag =
	| typeof FunctionComponent
	| typeof HostRoot
	| typeof HostComponent
	| typeof HostText;

export const FunctionComponent = 0;

// ReactDom.render(app, hostRoot)
export const HostRoot = 3;

// 类似 <div> 这种原生的 tag
export const HostComponent = 5;

// <div>123</div> 123 就是 HostText
export const HostText = 6;
