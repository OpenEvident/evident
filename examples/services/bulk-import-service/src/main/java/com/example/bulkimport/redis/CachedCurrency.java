package com.example.bulkimport.redis;

public record CachedCurrency(String currencyId, int precision) {

    String encode() {
        return currencyId + "|" + precision;
    }

    static CachedCurrency decode(String raw) {
        int separator = raw.lastIndexOf('|');
        return new CachedCurrency(raw.substring(0, separator), Integer.parseInt(raw.substring(separator + 1)));
    }
}
