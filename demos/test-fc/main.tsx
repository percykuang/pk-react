import { useState } from 'react';
import ReactDOM from 'react-dom/client';

const App = () => {
	const [n] = useState(100);
	return <div>{n}</div>;
};

// const Child = () => {
// 	return <h1>hello pk react</h1>;
// };

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
