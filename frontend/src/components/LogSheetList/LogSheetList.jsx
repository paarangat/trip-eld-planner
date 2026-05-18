// One LogSheet per trip day.

import LogSheet from "../LogSheet/LogSheet.jsx";

export default function LogSheetList({ logs = [] }) {
  if (logs.length === 0) {
    return null;
  }
  return (
    <div className="log-sheet-list">
      {logs.map((log) => (
        <LogSheet key={log.date} log={log} />
      ))}
    </div>
  );
}
