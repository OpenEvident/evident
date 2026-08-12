package com.example.bulkimport.repository;

import com.example.bulkimport.domain.ImportRequest;
import java.util.Optional;
import org.springframework.data.mongodb.repository.MongoRepository;

public interface ImportRequestRepository extends MongoRepository<ImportRequest, String> {

    Optional<ImportRequest> findByRequestId(String requestId);
}
