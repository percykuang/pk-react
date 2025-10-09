import { FiberNode } from './fiber';

// import internals from 'shared/internals';

let currentlyRenderingFiber: FiberNode | null = null;
// let workInProgressHook: Hook | null = null;

// const { currentDispatcher } = internals;

interface Hook {
	memoizedState: any;
	updateQueue: unknown;
	next: Hook | null;
}

export function renderWithHooks(wip: FiberNode) {
	// 赋值
	currentlyRenderingFiber = wip;
	wip.memoizedState = null;

	const current = wip.alternate;

	if (current !== null) {
		// update
	} else {
		// mount
		// currentDispatcher
	}

	const Component = wip.type;
	const props = wip.pendingProps;
	const children = Component(props);

	// 重置
	currentlyRenderingFiber = null;

	return children;
}
