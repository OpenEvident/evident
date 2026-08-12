package com.example.menu.domain;

import java.util.List;

/**
 * {@code amount} is an integer in minor units (1300 = 13.00 AED) —
 * confirmed against real {@code Price.java} ({@code private int amount}),
 * the standard way to avoid floating-point money bugs.
 */
public record ProductPrice(String currencyId, int amount, boolean taxInclusive, List<String> taxIds) {
}
