package com.example.publishing.service;

import com.example.publishing.domain.TaxSourceLevel;
import com.example.publishing.web.dto.PublishTaxDto;
import java.util.List;

public record TaxResolution(List<PublishTaxDto> taxes, TaxSourceLevel level) {
}
