package com.example.moduleb;

import org.springframework.transaction.annotation.Transactional;
import org.springframework.scheduling.annotation.Async;

public class OrderService {
    @Transactional
    @Async
    public void saveAndSend() {
        // BUG: @Transactional + @Async on same method boundary
    }
}
