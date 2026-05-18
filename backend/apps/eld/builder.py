"""Slice a Timeline into one DailyLog per calendar day.

A drive or rest that crosses midnight is split across two DailyLogs — see
CLAUDE.md §8.3. The four duty-status totals on each DailyLog must sum to
exactly 24:00; the builder asserts this before returning.

Implementations land in subsequent commits.
"""
