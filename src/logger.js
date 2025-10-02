const timestamp = () => new Date().toISOString();

const log = (level, message, metadata = {}) => {
  const payload = {
    level,
    timestamp: timestamp(),
    message,
    ...metadata,
  };
  const write = console[level] || console.log;
  write(JSON.stringify(payload));
};

const info = (message, metadata) => log('info', message, metadata);
const warn = (message, metadata) => log('warn', message, metadata);
const error = (message, metadata) => log('error', message, metadata);

export default { info, warn, error };
