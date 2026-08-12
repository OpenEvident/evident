package com.example.bulkimport.service;

import java.util.List;

public record ResolvedRefs(String currencyId, int currencyPrecision, List<String> taxIds) {
}
