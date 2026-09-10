export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin h-12 w-12 border-4 border-[#00ff9f] border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-gray-400">Loading ReaganXS...</p>
      </div>
    </div>
  );
}