import { useState } from 'react';
import ReactDOM from 'react-dom/client';

const App = () => {
	const [n, setN] = useState(100);
	// @ts-expect-error xxx
	window.setN = setN;
	return n === 3 ? <Child /> : <div>{n}</div>;
};

const Child = () => {
	return <h1>hello pk react</h1>;
};

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
