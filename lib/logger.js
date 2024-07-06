/**
 * Surrealigrate
 * @copyright Copyright (c) 2024 David Dyess II
 * @license MIT see LICENSE
 */
import { Container, format, transports } from 'winston';

const { colorize, combine, label, prettyPrint, printf, timestamp } = format;

const loggers = {};
const container = new Container();

const createLogger = (category, categoryLabel) => {
  let formatter = (data) => `[${data.level}][${data.label}] ${data.message}`;
  const formatters = [colorize(), label({ label: categoryLabel })];

  formatters.push(timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }));
  formatter = (data) =>
    `${data.timestamp}  ${data.level} ${data.label} : ${data.message}`;

  formatters.push(prettyPrint(), printf(formatter));
  container.add(category, {
    transports: [
      new transports.Console({
        level: 'info',
        format: combine.apply(null, formatters)
      }),
      new transports.File({
        level: 'info',
        format: combine(
          timestamp(),
          printf(({ timestamp, level, message }) => {
            return `${timestamp} [${level}]: ${message}`;
          })
        ),
        filename: './logs/migrations.log'
      })
    ]
  });

  return container.get(category);
};

export const getLogger = (category, categoryLabel = category) => {
  if (!loggers[category]) {
    loggers[category] = createLogger(category, categoryLabel);
  }

  return loggers[category];
};
