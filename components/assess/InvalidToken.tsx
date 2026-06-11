export default function InvalidToken() {
  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center space-y-4">
        <div className="text-4xl" aria-hidden>
          🔗
        </div>
        <h1 className="text-2xl font-semibold text-gray-900">
          This link is no longer available
        </h1>
        <p className="text-gray-600 leading-relaxed">
          This assessment link has expired, been used, or is not valid.
        </p>
        <p className="text-gray-600 leading-relaxed">
          If you need to complete your monthly assessment, please call your
          pharmacy directly.
        </p>
      </div>
    </main>
  );
}
