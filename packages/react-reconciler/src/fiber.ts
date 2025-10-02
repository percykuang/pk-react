import { Container } from 'hostConfig';
import { Key, Props, ReactElementType, Ref } from 'shared/ReactTypes';

import { Flags, NoFlags } from './fiberFlags';
import { FunctionComponent, HostComponent, WorkTag } from './workTags';

export class FiberNode {
	type: any;
	tag: WorkTag;
	pendingProps: Props;
	key: Key;
	stateNode: any;
	ref: Ref;

	return: FiberNode | null;
	sibling: FiberNode | null;
	child: FiberNode | null;
	index: number;

	memoizedProps: Props | null;
	memoizedState: any;
	alternate: FiberNode | null;
	flags: Flags;
	updateQueue: unknown;

	constructor(tag: WorkTag, pendingProps: Props, key: Key) {
		// 实例
		this.tag = tag;
		this.key = key;
		// HostCompent <div> div DOM
		this.stateNode = null;
		// Fiber Node 的类型，比如一个 FunctionComponent 本身
		this.type = null;

		// 构成树状结构
		// 指向父 fiberNode
		this.return = null;
		// 指向第一个子 fiberNode
		this.sibling = null;
		// 指向子 child
		this.child = null;
		// 指向多个 child 时数组的下标
		this.index = 0;

		this.ref = null;

		// 作为工作单元
		// 刚开始准备工作时的 props
		this.pendingProps = pendingProps;
		this.memoizedState = null;
		// 工作完成确定的 props
		this.memoizedProps = null;
		this.updateQueue = null;

		// 备用节点，指向另一颗 fiber 树，形成双缓存机制
		this.alternate = null;
		// 副作用
		this.flags = NoFlags;
	}
}

export class FiberRootNode {
	container: Container;
	current: FiberNode;
	finishedWork: FiberNode | null;

	constructor(container: Container, hostRootFiber: FiberNode) {
		this.container = container;
		this.current = hostRootFiber;
		hostRootFiber.stateNode = this;
		this.finishedWork = null;
	}
}

export const createWorkInProgress = (
	current: FiberNode,
	pendingProps: Props
): FiberNode => {
	let wip = current.alternate;

	if (wip === null) {
		// mount
		wip = new FiberNode(current.tag, pendingProps, current.key);
		wip.stateNode = current.stateNode;

		wip.alternate = current;
		current.alternate = wip;
	} else {
		// update
		wip.pendingProps = pendingProps;
		wip.flags = NoFlags;
	}
	wip.type = current.type;
	wip.updateQueue = current.updateQueue;
	wip.child = current.child;
	wip.memoizedProps = current.memoizedProps;
	wip.memoizedState = current.memoizedState;

	return wip;
};

export function createFiberFromElement(element: ReactElementType): FiberNode {
	const { type, key, props } = element;
	let fiberTag: WorkTag = FunctionComponent;

	if (typeof type === 'string') {
		fiberTag = HostComponent;
	} else if (typeof type !== 'function' && __DEV__) {
		console.warn('未定义的 type 类型', element);
	}

	const fiber = new FiberNode(fiberTag, props, key);
	fiber.type = type;
	return fiber;
}
