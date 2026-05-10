// Custom assertion helpers

const AssertionHelpers = {
  // Validate monetary amount
  expectValidMonetaryAmount(amount) {
    expect(typeof amount).toBe('number');
    expect(amount).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(amount)).toBe(true);
  },

  // Validate date format (ISO 8601)
  expectValidDateFormat(date) {
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/;
    expect(date).toMatch(isoDateRegex);
  }
};

// Extend Jest matchers
expect.extend({
  toBeValidMonetaryAmount(received) {
    try {
      AssertionHelpers.expectValidMonetaryAmount(received);
      return { pass: true };
    } catch (error) {
      return {
        pass: false,
        message: () => `Expected ${received} to be a valid monetary amount: ${error.message}`
      };
    }
  }
});

module.exports = AssertionHelpers;
