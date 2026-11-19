// src/App.jsx
// ------------
// Root component for SmartCare.
// React Router will be set up here in future steps.
// For now it shows a "Setup Successful" landing page.

function App() {
  return (
    <div className="min-h-screen bg-blue-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-10 text-center max-w-md">
        {/* Hospital cross icon */}
        <div className="text-6xl mb-4">🏥</div>

        <h1 className="text-3xl font-bold text-blue-700 mb-2">
          SmartCare
        </h1>
        <p className="text-gray-500 text-sm mb-6">
          Integrated Hospital Management System
        </p>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
          <p className="text-green-700 font-semibold text-sm">
            ✅ React + Tailwind CSS Setup Successful!
          </p>
        </div>

        <div className="text-left text-sm text-gray-600 space-y-1">
          <p>📦 <strong>Frontend:</strong> React + Vite + Tailwind CSS</p>
          <p>🔗 <strong>Backend:</strong> Django REST Framework</p>
          <p>🗄️ <strong>Database:</strong> MySQL</p>
          <p>🔐 <strong>Auth:</strong> JWT Tokens</p>
        </div>
      </div>
    </div>
  );
}

export default App;
