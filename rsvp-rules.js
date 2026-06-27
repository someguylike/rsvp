(function (global) {
  const DEFAULT_PLAY_START_HOUR = 6;
  const DEFAULT_UNVOTE_LOCK_HOURS_BEFORE_PLAY = 6;

  function formatDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  function getStartOfMonthValue(now) {
    const current = now || new Date();
    return formatDate(new Date(current.getFullYear(), current.getMonth(), 1));
  }

  function isDateInCurrentMonthOrLater(value, now) {
    return (
      /^\d{4}-\d{2}-\d{2}$/.test(value || "") &&
      value >= getStartOfMonthValue(now)
    );
  }

  function getPlayStart(value, options) {
    const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      return null;
    }

    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
      Number(options?.playStartHour ?? DEFAULT_PLAY_START_HOUR),
      0,
      0,
      0,
    );
  }

  function getUnvoteLockTime(value, options) {
    const playStart = getPlayStart(value, options);
    if (!playStart) {
      return null;
    }

    return new Date(
      playStart.getTime() -
        Number(
          options?.unvoteLockHoursBeforePlay ??
            DEFAULT_UNVOTE_LOCK_HOURS_BEFORE_PLAY,
        ) *
          60 *
          60 *
          1000,
    );
  }

  function isUnvoteLocked(value, now, options) {
    const lockTime = getUnvoteLockTime(value, options);
    return Boolean(lockTime && (now || new Date()) >= lockTime);
  }

  global.RsvpRules = {
    DEFAULT_PLAY_START_HOUR,
    DEFAULT_UNVOTE_LOCK_HOURS_BEFORE_PLAY,
    formatDate,
    getStartOfMonthValue,
    isDateInCurrentMonthOrLater,
    getPlayStart,
    getUnvoteLockTime,
    isUnvoteLocked,
  };
})(window);
