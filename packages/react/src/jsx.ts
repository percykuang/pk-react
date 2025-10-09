import { REACT_ELEMENT_TYPE } from 'shared/ReactSymbols';
import {
	ElementType,
	Key,
	Props,
	ReactElementType,
	Ref,
	Type
} from 'shared/ReactTypes';

const ReactElement = function (
	type: Type,
	key: Key,
	ref: Ref,
	props: Props
): ReactElementType {
	const element = {
		$$typeof: REACT_ELEMENT_TYPE,
		type,
		key,
		ref,
		props,
		__mark: 'pk-react'
	};
	return element;
};

export function isValidElement(object: any) {
	return (
		typeof object === 'object' &&
		object !== null &&
		object.$$typeof === REACT_ELEMENT_TYPE
	);
}

export const jsx = (
	type: ReactElementType,
	config: any,
	...maybeChildren: any
) => {
	let key: Key = null;
	const props: Props = {};
	let ref: Ref = null;

	for (const prop in config) {
		const val = config[prop];
		if (prop === 'key') {
			if (val !== undefined) {
				key = String(val);
			}
			continue;
		}
		if (prop === 'ref') {
			if (val !== undefined) {
				ref = val;
			}
			continue;
		}
		/**
		 * {}.hasOwnProperty.call(config, prop) 和 config.hasOwnProperty(prop)
		 * 都用于判断对象 config 是否自身拥有属性 prop（不包括继承的属性）
		 * 但两者存在一个关键区别：当 config 自身覆盖了 hasOwnProperty 方法时
		 * 后者会失效，而前者更可靠
		 */
		if ({}.hasOwnProperty.call(config, prop)) {
			props[prop] = val;
		}
	}
	const maybeChildrenLength = maybeChildren.length;
	if (maybeChildrenLength !== 0) {
		// [child] 或 [child1, child2]
		if (maybeChildrenLength === 1) {
			props.children = maybeChildren[0];
		} else {
			props.children = maybeChildren;
		}
	}
	return ReactElement(type, key, ref, props);
};

export const jsxDEV = (type: ElementType, config: any) => {
	let key: Key = null;
	const props: Props = {};
	let ref: Ref = null;

	for (const prop in config) {
		const val = config[prop];
		if (prop === 'key') {
			if (val !== undefined) {
				key = String(val);
			}
			continue;
		}
		if (prop === 'ref') {
			if (val !== undefined) {
				ref = val;
			}
			continue;
		}
		/**
		 * {}.hasOwnProperty.call(config, prop) 和 config.hasOwnProperty(prop)
		 * 都用于判断对象 config 是否自身拥有属性 prop（不包括继承的属性）
		 * 但两者存在一个关键区别：当 config 自身覆盖了 hasOwnProperty 方法时
		 * 后者会失效，而前者更可靠
		 */
		if ({}.hasOwnProperty.call(config, prop)) {
			props[prop] = val;
		}
	}

	return ReactElement(type, key, ref, props);
};
