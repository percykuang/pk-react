import React from 'react';
import ReactDOM from 'react-dom/client';

const App = () => {
	return (
		<div>
			<p>
				<Child />
			</p>
		</div>
	);
};

const Child = () => {
	return <h1>hello pk react</h1>;
};

ReactDOM.createRoot(document.getElementById('root')!).render(<App />);
