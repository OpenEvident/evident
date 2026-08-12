package com.example.bulkimport.redis;

import com.example.bulkimport.domain.SyncItemAction;
import com.example.bulkimport.domain.SyncStep;
import java.util.List;

public record SyncItemState(
        String partnerId,
        SyncStep step,
        String resolvedCurrencyId,
        List<String> resolvedTaxIds,
        SyncItemAction action,
        String error
) {
}
